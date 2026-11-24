import { Alert, Badge, Card, Code, Group, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft, IconCheck, IconChevronDown, IconChevronRight, IconCopy, IconTextWrap,
} from '@tabler/icons-react';
import { load } from 'js-yaml';
import type { ReactNode } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { RecordActionExtras, RecordContentExtras } from '@/components/common/addon-slots';
import { Button, UnstyledButton } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ResponsiveSidebar } from '@/components/common/responsive-sidebar';
import { TimeDisplay } from '@/components/common/time-display';
import { clearScratchpadDraft, getScratchpadDraftScope } from '@/components/editor/draft-storage';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { getScoreTone, getStatusTone, judgeBadgeStyle, STATUS, STATUS_TEXTS } from '@/components/record/status-map';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { useRecordSocket } from '@/hooks/use-record-socket';
import { formatErrorMessage } from '@/utils/error';
import { highlightCodeLines } from '@/utils/highlight';
import { extractLocalizedContent } from '@/utils/i18n-content';
import { normalizeObjectiveAnswers, objectiveCaseId } from '@/utils/objective-answers';
import { getRecordProblemQuery, getRecordReturnQuery, getSubmissionRecordQuery } from '@/utils/problem-navigation';
import { formatUserName } from '@/utils/user-name';

function asArray(value: any) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatMemory(memory?: number) {
  if (memory == null) return '-';
  if (memory < 1024) return `${Math.round(memory)} KB`;
  return `${Math.round(memory / 1024)} MB`;
}

function formatSize(size?: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(time?: number) {
  if (time == null) return '-';
  return `${Math.round(time)}ms`;
}

function objectIdDate(id: any) {
  const text = String(id || '');
  if (!/^[a-f0-9]{24}$/i.test(text)) return null;
  return new Date(Number.parseInt(text.slice(0, 8), 16) * 1000);
}

function shouldShowGreaterEqual(status?: number) {
  return [
    STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
  ].includes(status as STATUS);
}

function formatStructuredText(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && typeof value.message === 'string') {
    let text = value.message;
    if (Array.isArray(value.params)) {
      value.params.forEach((param: any, index: number) => {
        text = text.replace(new RegExp(`\\{${index}\\}`, 'g'), formatStructuredText(param));
      });
    }
    return text;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeCases(rdoc: any) {
  const list = asArray(rdoc.testCases || rdoc.cases || []);
  return list.map((item: any, index: number) => ({
    ...item,
    questionId: objectiveCaseId(item),
    id: item.id ?? index + 1,
    subtaskId: item.subtaskId ?? item.subtask ?? 1,
  }));
}

function groupCases(cases: any[]) {
  const groups = new Map<string, any[]>();
  for (const item of cases) {
    const key = String(item.subtaskId ?? item.id ?? 1);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return Array.from(groups.entries()).map(([id, items]) => ({ id, items }));
}

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to legacy textarea copy.
    }
  }
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function CaseMessage({ message }: { message?: any }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const text = formatStructuredText(message);
  if (!text) return null;
  const isLong = text.length > 140 || text.split('\n').length > 2;
  return (
    <div className="mt-1">
      <Text
        size="xs"
        c="dimmed"
        className={`whitespace-pre-wrap break-words ${isLong && !expanded ? 'line-clamp-2' : ''}`}
      >
        {text}
      </Text>
      {isLong && (
        <UnstyledButton
          type="button"
          className="hydro-case-message__toggle mt-0.5 text-xs font-medium text-[var(--hydro-primary)] hover:underline"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t('Show less') : t('Show more')}
        </UnstyledButton>
      )}
    </div>
  );
}

function getCaseKey(groupId: string, item: any, index: number) {
  return `${groupId}-${item.id}-${index}`;
}

function getCaseLabel(groupId: string, item: any, index: number, showSubtask: boolean, objective: boolean) {
  if (objective) return `#${item.questionId}`;
  return showSubtask ? `#${groupId}-${item.id}` : `#${index + 1}`;
}

function TestCasesCard({
  cases,
  subtasks,
  objective = false,
}: {
  cases: any[];
  subtasks: Record<string, any>;
  objective?: boolean;
}) {
  const { t } = useI18n();
  const groups = useMemo(() => groupCases(cases), [cases]);
  const showSubtask = !objective && (groups.length > 1 || groups.some((group) => group.items.length > 1));
  const canCollapseGroups = showSubtask && groups.length > 1;
  const acceptedCount = useMemo(
    () => cases.filter((item) => item.status === STATUS.STATUS_ACCEPTED).length,
    [cases],
  );
  const defaultCollapsed = useMemo(() => {
    if (!canCollapseGroups || cases.length <= 25) return new Set<string>();
    const collapsed = new Set<string>();
    for (const group of groups) {
      if (group.items.every((item) => item.status === STATUS.STATUS_ACCEPTED)) {
        collapsed.add(group.id);
      }
    }
    return collapsed;
  }, [canCollapseGroups, cases.length, groups]);
  const [manualToggles, setManualToggles] = useState<Record<string, boolean>>({});
  const [focusedKey, setFocusedKey] = useState('');
  const focusTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (focusTimerRef.current != null) window.clearTimeout(focusTimerRef.current);
  }, []);

  const isGroupCollapsed = (groupId: string) => {
    if (!canCollapseGroups) return false;
    if (groupId in manualToggles) return manualToggles[groupId];
    return defaultCollapsed.has(groupId);
  };

  const toggleGroup = (groupId: string) => {
    setManualToggles((prev) => ({ ...prev, [groupId]: !isGroupCollapsed(groupId) }));
  };

  const allCollapsed = canCollapseGroups && groups.every((group) => isGroupCollapsed(group.id));
  const toggleAllGroups = () => {
    const nextState = !allCollapsed;
    const next: Record<string, boolean> = {};
    for (const group of groups) next[group.id] = nextState;
    setManualToggles(next);
  };

  const jumpToCase = (groupId: string, caseKey: string) => {
    if (isGroupCollapsed(groupId)) {
      setManualToggles((prev) => ({ ...prev, [groupId]: false }));
    }
    setFocusedKey(caseKey);
    if (focusTimerRef.current != null) window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => setFocusedKey(''), 1800);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`record-case-${caseKey}`);
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const summaryTone = acceptedCount === cases.length ? 'ac' : acceptedCount > 0 ? 'tle' : 'neutral';

  return (
    <Card withBorder p={0} className="hydro-content-card hydro-record-card overflow-hidden">
      <Group justify="space-between" p="lg" gap="sm" wrap="wrap">
        <Group gap="xs">
          <Text size="sm" fw={700}>{t('Test Cases')}</Text>
          {!objective ? (
            <Badge variant="light" style={judgeBadgeStyle(summaryTone)} className="hydro-numeric">
              {acceptedCount} / {cases.length}
            </Badge>
          ) : (
            <Badge variant="light" className="hydro-numeric">{cases.length}</Badge>
          )}
        </Group>
        {canCollapseGroups && (
          <Button
            type="button"
            size="compact-xs"
            variant="subtle"
            onClick={toggleAllGroups}
          >
            {allCollapsed ? t('Expand all') : t('Collapse all')}
          </Button>
        )}
      </Group>

      {!objective && (
        <div className="hydro-record-case-matrix border-t border-[var(--hydro-border)] px-5 py-3">
          {groups.flatMap((group) => group.items.map((item, index) => {
            const caseKey = getCaseKey(group.id, item, index);
            const label = getCaseLabel(group.id, item, index, showSubtask, false);
            const tone = getStatusTone(item.status);
            const statusText = t(STATUS_TEXTS[item.status] || 'Unknown Error');
            const prefix = shouldShowGreaterEqual(item.status) ? '>= ' : '';
            const details = [
              `${label} · ${statusText}`,
              item.score != null ? `${t('Score')}: ${item.score}` : '',
              item.time != null ? `${prefix}${formatTime(item.time)}` : '',
              item.memory != null ? `${prefix}${formatMemory(item.memory)}` : '',
            ].filter(Boolean).join(' · ');

            return (
              <Tooltip key={caseKey} label={details} withArrow openDelay={120}>
                <UnstyledButton
                  type="button"
                  aria-label={details}
                  onClick={() => jumpToCase(group.id, caseKey)}
                  className={[
                    'hydro-record-case-tile hydro-numeric',
                    `hydro-record-case-tile--${tone}`,
                    focusedKey === caseKey ? 'hydro-record-case-tile--active' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {showSubtask ? `${group.id}-${item.id}` : index + 1}
                </UnstyledButton>
              </Tooltip>
            );
          }))}
        </div>
      )}

      <div className="border-t border-[var(--hydro-border)] overflow-x-auto">
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="w-28">{objective ? '#' : t('Test Case')}</Table.Th>
              <Table.Th>{t('Status')}</Table.Th>
              {!objective && <Table.Th className="w-28 text-right">{t('Time Cost')}</Table.Th>}
              {!objective && <Table.Th className="w-32 text-right">{t('Memory Cost')}</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groups.map((group) => {
              const subtask = subtasks?.[group.id];
              const collapsed = isGroupCollapsed(group.id);
              const groupPassed = group.items.filter((item) => item.status === STATUS.STATUS_ACCEPTED).length;
              return (
                <Fragment key={group.id}>
                  {showSubtask && (
                    <Table.Tr key={`subtask-${group.id}`} className="hydro-record-subtask-row bg-[var(--hydro-surface-tint)]">
                      <Table.Td>
                        {canCollapseGroups ? (
                          <UnstyledButton
                            type="button"
                            onClick={() => toggleGroup(group.id)}
                            aria-expanded={!collapsed}
                            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--hydro-text)]"
                          >
                            {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
                            <span>#{group.id}</span>
                          </UnstyledButton>
                        ) : (
                          <Text size="xs" fw={800}>#{group.id}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          {subtask?.status != null && <RecordStatusBadge status={subtask.status} size="xs" equalWidth />}
                          {subtask?.score != null && <Badge variant="light">{subtask.score}</Badge>}
                          <Text size="xs" c="dimmed" className="hydro-numeric">
                            {groupPassed}/{group.items.length}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td />
                      <Table.Td />
                    </Table.Tr>
                  )}
                  {!collapsed && group.items.map((item, index) => {
                    const prefix = shouldShowGreaterEqual(item.status) ? '>= ' : '';
                    const caseKey = getCaseKey(group.id, item, index);
                    return (
                      <Table.Tr
                        key={caseKey}
                        id={`record-case-${caseKey}`}
                        className={focusedKey === caseKey ? 'hydro-record-case-row--focused' : undefined}
                      >
                        <Table.Td>
                          <Text size="xs" fw={700} className="hydro-numeric">
                            {getCaseLabel(group.id, item, index, showSubtask, objective)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <RecordStatusBadge status={item.status} size="xs" equalWidth />
                            {item.score != null && <Badge variant="light" color="gray">{item.score}</Badge>}
                          </Group>
                          <CaseMessage message={item.message} />
                        </Table.Td>
                        {!objective && <Table.Td className="text-right">
                          <Text size="xs" className="hydro-numeric">{prefix}{formatTime(item.time)}</Text>
                        </Table.Td>}
                        {!objective && <Table.Td className="text-right">
                          <Text size="xs" className="hydro-numeric">{prefix}{formatMemory(item.memory)}</Text>
                        </Table.Td>}
                      </Table.Tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    </Card>
  );
}

function ObjectiveAnswerTable({ code }: { code: string }) {
  const { t } = useI18n();
  let answers = {};
  try { answers = normalizeObjectiveAnswers(load(code)); } catch { /* Keep malformed historical submissions readable. */ }
  const entries = Object.entries(answers);
  if (!entries.length) return <Code block>{code}</Code>;
  return (
    <Table style={{ tableLayout: 'fixed' }}>
      <Table.Thead><Table.Tr><Table.Th className="w-24">#</Table.Th><Table.Th>{t('Content')}</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>
        {entries.map(([id, answer]) => (
          <Table.Tr key={id}>
            <Table.Td>{id}</Table.Td>
            <Table.Td className="whitespace-pre-wrap break-words">{Array.isArray(answer) ? answer.join(', ') : String(answer)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function SourceCodeCard({
  code,
  lang,
  isObjective,
  record,
}: {
  code: string;
  lang?: string;
  isObjective: boolean;
  record: any;
}) {
  const { t } = useI18n();
  const [wrapped, setWrapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const highlighted = useMemo(
    () => (isObjective ? null : highlightCodeLines(code, lang)),
    [code, isObjective, lang],
  );

  useEffect(() => () => {
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const handleCopy = async () => {
    const ok = await copyText(code);
    if (!ok) {
      notifications.show({ title: t('Copy failed'), message: '', color: 'red' });
      return;
    }
    setCopied(true);
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card withBorder p="lg" className="hydro-content-card hydro-record-card">
      <Stack gap="sm">
        <Group justify="space-between" gap="sm" wrap="wrap">
          <Group gap="xs">
            <Text size="sm" fw={700}>{t(isObjective ? 'problem_type.objective' : 'Source Code')}</Text>
            {!isObjective && highlighted && (
              <Badge size="xs" variant="light" color="gray" className="hydro-numeric">
                {highlighted.lines.length} {t('Lines')}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {!isObjective && (
              <>
                <Button
                  type="button"
                  size="compact-xs"
                  variant={wrapped ? 'light' : 'subtle'}
                  leftSection={<IconTextWrap size={14} />}
                  onClick={() => setWrapped((current) => !current)}
                  aria-pressed={wrapped}
                >
                  {t('Word wrap')}
                </Button>
                <Button
                  type="button"
                  size="compact-xs"
                  variant="subtle"
                  color={copied ? 'green' : undefined}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={() => void handleCopy()}
                >
                  {copied ? t('Copied') : t('Copy code')}
                </Button>
              </>
            )}
            <RecordActionExtras record={record} />
          </Group>
        </Group>
        {isObjective ? <ObjectiveAnswerTable code={code} /> : (
          <div
            className={`hydro-record-source hydro-code-viewer ${wrapped ? 'hydro-code-viewer--wrapped' : ''}`}
            tabIndex={0}
            aria-label={t('Source Code')}
          >
            <table className="hydro-code-table">
              <tbody>
                {(highlighted?.lines || []).map((lineHtml, index) => (
                  <tr key={index} className="hydro-code-row">
                    <td className="hydro-code-line-no hydro-numeric" aria-hidden="true">
                      {index + 1}
                    </td>
                    <td className="hydro-code-line-text">
                      <span
                        className="hljs"
                        dangerouslySetInnerHTML={{ __html: lineHtml || ' ' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stack>
    </Card>
  );
}

function Metric({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="hydro-record-metric min-w-0 px-3 py-2">
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{label}</Text>
      <Text size="sm" fw={700} className="hydro-numeric truncate text-[var(--hydro-text)]" title={String(value)}>{value}</Text>
    </div>
  );
}

function InfoRow({ label, children }: { label: string, children: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-start" gap="md" className="border-b border-[var(--hydro-border)] py-2 last:border-b-0">
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{label}</Text>
      <div className="min-w-0 text-right">{children}</div>
    </Group>
  );
}

function OutputBlock({ title, content }: { title: string, content: string }) {
  return (
    <Card withBorder p="lg" className="hydro-content-card hydro-record-card">
      <Stack gap="sm">
        <Text size="sm" fw={700}>{title}</Text>
        <div className="hydro-record-output">
          <Code block className="min-w-max bg-transparent p-3">{content}</Code>
        </div>
      </Stack>
    </Card>
  );
}

function wasClearedLocally(key: string) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export default function RecordDetailPage() {
  const { args } = usePageData();
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const user = useCurrentUser();
  const canJudge = args.canRejudge === true;
  const [actionLoading, setActionLoading] = useState('');
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [clearCodeTarget, setClearCodeTarget] = useState<string | null>(null);
  const [clearingCode, setClearingCode] = useState(false);
  const [clearedRecord, setClearedRecord] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Merge server-side data with real-time WebSocket updates
  const serverRdoc = args.rdoc || {};
  const wsUpdate = useRecordSocket(serverRdoc._id);
  const rdoc = wsUpdate ? { ...serverRdoc, ...wsUpdate } : serverRdoc;
  const udoc = args.udoc || {};
  const judgeUdoc = args.judge_udoc || args.judgeUdoc;
  const pdoc = args.pdoc || {};
  const isObjective = pdoc.config?.type === 'objective';
  const tdoc = args.tdoc;
  const draftDomainId = serverRdoc.domainId || args.UiContext?.domainId;
  const actionRecord = serverRdoc._id ? JSON.stringify([draftDomainId, String(serverRdoc._id), user._id]) : null;
  const draftKey = canJudge && !isObjective && user._id > 0 && user._id === (serverRdoc.uid ?? udoc._id)
    ? getScratchpadDraftScope(user._id, draftDomainId, pdoc._id, tdoc?.docId || tdoc?._id)?.cacheKey
    : null;
  const remoteDraftRid = canJudge && args.canClearSubmitterDraft === true && serverRdoc._id ? String(serverRdoc._id) : '';
  const localClearReceipt = draftKey && actionRecord ? `hydro:record-draft-cleared:v1:${actionRecord}` : null;
  const draftClearDone = (actionRecord !== null && clearedRecord === actionRecord)
    || args.editorDraftResetQueued === true || rdoc.editorDraftResetQueued === true
    || (localClearReceipt !== null && wasClearedLocally(localClearReceipt));
  const clearTarget = !draftClearDone && (draftKey || remoteDraftRid) ? actionRecord : null;
  const draftSubmitter = formatUserName(udoc) || String(serverRdoc.uid ?? '');
  const showJudgeActions = canJudge && !rdoc.files?.hack;
  const allRevs = args.allRevs || {};
  const rev = args.rev;

  const compilerTexts = asArray(rdoc.compilerTexts || rdoc.compilerText).map(formatStructuredText).filter(Boolean);
  const judgeTexts = asArray(rdoc.judgeTexts || rdoc.judgeText).map(formatStructuredText).filter(Boolean);
  const cases = normalizeCases(rdoc);
  const submitAt = objectIdDate(rdoc._id);
  const isJudging = rdoc.status === STATUS.STATUS_JUDGING || rdoc.status === STATUS.STATUS_COMPILING || rdoc.status === STATUS.STATUS_FETCHED;
  const recordId = String(rdoc._id || '').slice(-6);
  const scoreTone = getScoreTone(rdoc.score ?? 0) ?? 'neutral';
  const isLimitStatus = shouldShowGreaterEqual(rdoc.status);
  const peakTime = cases.length ? Math.max(...cases.map((item) => Number(item.time) || 0)) : null;
  const codeLength = rdoc.code ? formatSize(new Blob([rdoc.code]).size) : '';
  const problemTitle = extractLocalizedContent(pdoc.title, language);
  const contestTitle = extractLocalizedContent(tdoc?.title, language);
  const problemQuery = getRecordProblemQuery(window.location.search, tdoc);
  const problemUrl = buildUrl('problem_detail', { pid: pdoc.pid || pdoc.docId || rdoc.pid }, problemQuery);
  const recordNavigationQuery = getSubmissionRecordQuery(new URLSearchParams(problemQuery).toString());

  const goBack = () => {
    const returnQuery = rdoc.uid === user._id
      ? getRecordReturnQuery(window.location.search, rdoc.status === STATUS.STATUS_ACCEPTED, tdoc)
      : null;
    if (returnQuery) {
      void navigate(buildUrl('problem_detail', { pid: pdoc.pid || pdoc.docId || rdoc.pid }, returnQuery), { replace: true });
    } else if (window.history.length > 1) window.history.back();
    else void navigate(buildUrl('record_main'), { replace: true });
  };

  const submitOperation = async (operation: 'rejudge' | 'cancel') => {
    if (!showJudgeActions || actionLoading) return;
    setActionLoading(operation);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        setError(formatErrorMessage(data.error, t('Operation failed')));
      } else {
        const target = data.redirect || data.url;
        if (target && target !== window.location.href && target !== window.location.pathname + window.location.search) {
          void navigate(target, { replace: true });
        } else {
          void navigate(window.location.pathname + window.location.search, { replace: true });
        }
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setActionLoading('');
    }
  };

  const confirmClearCode = async () => {
    if (!clearTarget || clearCodeTarget !== clearTarget || clearingCode) return;
    setClearingCode(true);
    try {
      if (draftKey) {
        clearScratchpadDraft(window.localStorage, draftKey);
        if (localClearReceipt) {
          try { window.localStorage.setItem(localClearReceipt, '1'); } catch { /* The draft was already cleared. */ }
        }
        notifications.show({ color: 'green', message: t('Local code cleared.') });
      } else {
        const response = await fetch(buildUrl('record_detail', { rid: remoteDraftRid }), {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'clear_draft' }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.queued !== true) throw new Error(formatErrorMessage(data?.error, t('Operation failed')));
        notifications.show({ color: 'green', message: t('Draft reset scheduled for {0}.', draftSubmitter) });
      }
      setClearedRecord(clearTarget);
      setClearCodeTarget(null);
    } catch (failure) {
      notifications.show({ color: 'red', message: failure instanceof Error ? t(failure.message) : t('Operation failed') });
    } finally {
      setClearingCode(false);
    }
  };

  return (
    <Stack gap="lg" className="hydro-record-detail">
      {error && <Text c="red" size="sm">{error}</Text>}
      {wsUpdate?.error && (
        <Alert color="orange" title={t('Live results disconnected')} role="alert">
          {t('Showing the last received results. Check your network connection and access permissions; refresh the page if needed.')}
        </Alert>
      )}
      <Card withBorder p="xl" className="hydro-record-hero overflow-hidden">
        <Group justify="space-between" align="center" gap="sm" mb="sm" wrap="wrap">
          <Group gap="xs">
            <Button
              type="button"
              variant="subtle"
              size="compact-sm"
              leftSection={<IconArrowLeft size={15} />}
              onClick={goBack}
            >
              {t('Back')}
            </Button>
            <Badge variant="light" className="hydro-record-accent-badge">
              {t('Record')}
            </Badge>
          </Group>
          <Group gap="sm">
            <RecordStatusBadge status={rdoc.status} size="lg" />
            {rdoc.score != null && (
              <Badge variant="light" style={judgeBadgeStyle(scoreTone)} size="lg" className="hydro-numeric">
                {rdoc.score}
              </Badge>
            )}
          </Group>
        </Group>
        <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
          <div className="min-w-0">
            <Tooltip label={String(rdoc._id || recordId)} withArrow openDelay={200}>
              <Title order={2} className="hydro-record-id-title">
                #{recordId || '-'}
              </Title>
            </Tooltip>
            <Text size="sm" c="dimmed" mt={4} className="truncate">
              {pdoc.pid || pdoc.docId ? (
                <Link
                  href={problemUrl}
                  className="hydro-subtle-link text-[var(--hydro-text-muted)] hover:text-[var(--hydro-primary)]"
                >
                  {pdoc.pid || pdoc.docId}. {problemTitle || ''}
                </Link>
              ) : (
                t('Submission detail')
              )}
            </Text>
          </div>
          <Group gap="sm">
            <RecordActionExtras record={rdoc} />
          </Group>
        </Group>
        <div className="hydro-record-metrics-scroll mt-5">
          <div className="hydro-record-metrics">
            <Metric label={t('Score')} value={rdoc.score ?? '-'} />
            {!isObjective && <>
              <Metric label={t('Total Time')} value={rdoc.time == null ? '-' : `${isLimitStatus ? '>= ' : ''}${formatTime(rdoc.time)}`} />
              <Metric label={t('Peak Time')} value={peakTime == null ? '-' : `${isLimitStatus ? '>= ' : ''}${formatTime(peakTime)}`} />
              <Metric label={t('Peak Memory')} value={rdoc.memory == null ? '-' : `${isLimitStatus ? '>= ' : ''}${formatMemory(rdoc.memory)}`} />
              <Metric label={t('Language')} value={rdoc.lang || '-'} />
            </>}
          </div>
        </div>
        {isJudging && (
          <Text c="blue" size="sm" mt="md" fw="var(--hydro-weight-semibold)">
            {t('Judging...')}
          </Text>
        )}
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Stack gap="md">
            {cases.length > 0 && (
              <TestCasesCard cases={cases} subtasks={rdoc.subtasks || {}} objective={isObjective} />
            )}

            {compilerTexts.length > 0 && (
              <OutputBlock title={t('Compiler Output')} content={compilerTexts.join('\n')} />
            )}

            {judgeTexts.length > 0 && (
              <OutputBlock title={t('Judge Message')} content={judgeTexts.join('\n')} />
            )}

            {rdoc.code && (
              <SourceCodeCard code={rdoc.code} lang={rdoc.lang} isObjective={isObjective} record={rdoc} />
            )}

            <RecordContentExtras record={rdoc} />
          </Stack>
        </div>

        <ResponsiveSidebar className="w-full shrink-0 lg:w-72" title={t('Submission detail') || t('Information')}>
          <div className="flex flex-col gap-3.5">
            {(showJudgeActions || clearTarget) && (
              <section className="hydro-sidebar-panel">
                <Stack gap="xs">
                  {showJudgeActions && (
                    <>
                      <Button size="xs" variant="light" loading={actionLoading === 'rejudge'} onClick={() => submitOperation('rejudge')}>
                        {t('Rejudge')}
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        loading={actionLoading === 'cancel'}
                        onClick={() => setCancelConfirmOpen(true)}
                      >
                        {t('Cancel Score')}
                      </Button>
                    </>
                  )}
                  {clearTarget && (
                    <Button size="xs" variant="subtle" color="red" onClick={() => setClearCodeTarget(clearTarget)}>
                      {t('Clear Code')}
                    </Button>
                  )}
                </Stack>
              </section>
            )}

            <section className="hydro-sidebar-panel">
              <Title order={3} size="h5" mb="sm">{t('Information')}</Title>
              <Stack gap={0}>
                <InfoRow label={t('Submit By')}>
                  <UserLink user={udoc} size="xs" />
                </InfoRow>
                {pdoc && (
                  <InfoRow label={t('Problem')}>
                    <Link
                      href={problemUrl}
                      className="block max-w-40 truncate text-xs no-underline hover:underline"
                    >
                      {pdoc.pid || pdoc.docId}. {problemTitle}
                    </Link>
                  </InfoRow>
                )}
                {tdoc && (
                  <InfoRow label={t(tdoc.rule === 'homework' ? 'Homework' : 'Contest')}>
                    <Link
                      to={tdoc.rule === 'homework' ? 'homework_detail' : 'contest_detail'}
                      params={{ tid: tdoc.docId || tdoc._id }}
                      className="block max-w-40 truncate text-xs no-underline hover:underline"
                    >
                      {contestTitle}
                    </Link>
                  </InfoRow>
                )}
                {!isObjective && <InfoRow label={t('Language')}>
                  <Text size="xs">{rdoc.lang || '-'}</Text>
                </InfoRow>}
                {!isObjective && codeLength && (
                  <InfoRow label={t('Code Length')}>
                    <Text size="xs">{codeLength}</Text>
                  </InfoRow>
                )}
                {submitAt && (
                  <InfoRow label={t('Submit At')}>
                    <TimeDisplay date={submitAt} format="absolute" />
                  </InfoRow>
                )}
                {rdoc.judgeAt && (
                  <InfoRow label={t('Judged At')}>
                    <TimeDisplay date={rdoc.judgeAt} format="absolute" />
                  </InfoRow>
                )}
                {judgeUdoc && (
                  <InfoRow label={t('Judged By')}>
                    <UserLink user={judgeUdoc} size="xs" />
                  </InfoRow>
                )}
                {rdoc.hackTarget && (
                  <InfoRow label={t('Hacked')}>
                    <Link to="record_detail" params={{ rid: rdoc.hackTarget }} className="text-xs no-underline hover:underline">
                      {rdoc.hackTarget}
                    </Link>
                  </InfoRow>
                )}
              </Stack>
            </section>

            {Object.keys(allRevs).length > 0 && (
              <section className="hydro-sidebar-panel">
                <Title order={3} size="h5" mb="sm">{t('History')}</Title>
                <Stack gap={4}>
                  <Link
                    href={buildUrl('record_detail', { rid: rdoc._id }, recordNavigationQuery)}
                    className={[
                      'rounded-md px-2 py-1 text-xs no-underline',
                      !rev
                        ? 'bg-[var(--hydro-primary-soft)] text-[var(--hydro-primary)]'
                        : 'hover:bg-[var(--hydro-surface)]',
                    ].join(' ')}
                  >
                    {t('Latest Version')}
                  </Link>
                  {Object.entries(allRevs).map(([rid, date]) => (
                    <Link
                      key={rid}
                      href={buildUrl('record_detail', { rid: rdoc._id }, { ...recordNavigationQuery, rev: rid })}
                      className={[
                        'rounded-md px-2 py-1 text-xs no-underline',
                        String(rev) === rid
                          ? 'bg-[var(--hydro-primary-soft)] text-[var(--hydro-primary)]'
                          : 'hover:bg-[var(--hydro-surface)]',
                      ].join(' ')}
                    >
                      <TimeDisplay date={date as any} format="absolute" />
                    </Link>
                  ))}
                </Stack>
              </section>
            )}
          </div>
        </ResponsiveSidebar>
      </div>

      <ConfirmDialog
        opened={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={async () => {
          await submitOperation('cancel');
          setCancelConfirmOpen(false);
        }}
        title={t('Cancel Score')}
        message={t('Are you sure you want to cancel the score for this submission?')}
        confirmLabel={t('Cancel Score')}
        confirmColor="red"
        loading={actionLoading === 'cancel'}
      />
      <ConfirmDialog
        opened={Boolean(clearTarget && clearCodeTarget === clearTarget)}
        onClose={() => setClearCodeTarget(null)}
        onConfirm={confirmClearCode}
        title={t('Clear Code')}
        message={draftKey
          ? t('Clear the code saved in this browser for this problem? Submitted code and scores will not change.')
          : t(
            'Clear the local draft for {0} now or when they reopen the editor? Submissions, scores, and replays are kept.',
            draftSubmitter,
          )}
        confirmLabel={t('Clear Code')}
        loading={clearingCode}
      />
    </Stack>
  );
}
