import { Badge, Button, Card, Code, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { Fragment, useState } from 'react';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { CodeReplay } from '@/components/record/code-replay';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { STATUS } from '@/components/record/status-map';
import { UserLink } from '@/components/user/user-link';
import { usePageData, useUiContext } from '@/context/page-data';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { useRecordSocket } from '@/hooks/use-record-socket';
import { formatErrorMessage } from '@/utils/error';

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

function buildReplayUrl(rid: string, injectedUrl?: string) {
  if (injectedUrl) return injectedUrl;
  if (!rid) return '';
  const match = window.location.pathname.match(/^(\/d\/[^/]+)?\/record\//);
  return `${match?.[1] || ''}/record/${rid}/replay`;
}

function normalizeCases(rdoc: any) {
  const list = asArray(rdoc.testCases || rdoc.cases || []);
  return list.map((item: any, index: number) => ({
    ...item,
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

function CaseMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text size="xs" c="dimmed" className="mt-1 line-clamp-2 whitespace-pre-wrap">
      {message}
    </Text>
  );
}

function CaseTable({ cases, subtasks }: { cases: any[], subtasks: Record<string, any> }) {
  const { t } = useI18n();
  const groups = groupCases(cases);
  const showSubtask = groups.length > 1 || groups.some((group) => group.items.length > 1);

  return (
    <div className="overflow-x-auto">
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-24">{t('Test Case')}</Table.Th>
            <Table.Th>{t('Status')}</Table.Th>
            <Table.Th className="w-28 text-right">{t('Time Cost')}</Table.Th>
            <Table.Th className="w-32 text-right">{t('Memory Cost')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.map((group) => {
            const subtask = subtasks?.[group.id];
            return (
              <Fragment key={group.id}>
                {showSubtask && (
                  <Table.Tr key={`subtask-${group.id}`} className="bg-[var(--hydro-surface-tint)]">
                    <Table.Td>
                      <Text size="xs" fw={800}>#{group.id}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {subtask?.status != null && <RecordStatusBadge status={subtask.status} size="xs" />}
                        {subtask?.score != null && <Badge variant="light">{subtask.score}</Badge>}
                      </Group>
                    </Table.Td>
                    <Table.Td />
                    <Table.Td />
                  </Table.Tr>
                )}
                {group.items.map((item, index) => {
                  const prefix = shouldShowGreaterEqual(item.status) ? '>= ' : '';
                  return (
                    <Table.Tr key={`${group.id}-${item.id}-${index}`}>
                      <Table.Td>
                        <Text size="xs" fw={700}>
                          {showSubtask ? `#${group.id}-${item.id}` : `#${index + 1}`}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <RecordStatusBadge status={item.status} size="xs" />
                          {item.score != null && <Badge variant="light" color="gray">{item.score}</Badge>}
                        </Group>
                        <CaseMessage message={item.message} />
                      </Table.Td>
                      <Table.Td className="text-right">
                        <Text size="xs">{prefix}{formatTime(item.time)}</Text>
                      </Table.Td>
                      <Table.Td className="text-right">
                        <Text size="xs">{prefix}{formatMemory(item.memory)}</Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );
}

function Metric({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="min-w-24 rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface-tint)] px-3 py-2">
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{label}</Text>
      <Text size="sm" fw={700} className="truncate text-[var(--hydro-text)]">{value}</Text>
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
    <Card withBorder p="lg" className="hydro-content-card">
      <Stack gap="sm">
        <Text size="sm" fw={700}>{title}</Text>
        <div className="overflow-x-auto rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-bg-soft)]">
          <Code block className="min-w-max bg-transparent p-3">{content}</Code>
        </div>
      </Stack>
    </Card>
  );
}

export default function RecordDetailPage() {
  const { args } = usePageData();
  const ui = useUiContext();
  const { t } = useI18n();
  const user = useCurrentUser();
  const canJudge = useHasPriv(PRIV.PRIV_JUDGE) || args.canRejudge;
  const canViewCodeReplay = useHasPriv(PRIV.PRIV_READ_RECORD_CODE) || (args.rdoc?.uid === user._id);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');

  // Merge server-side data with real-time WebSocket updates
  const serverRdoc = args.rdoc || {};
  const wsUpdate = useRecordSocket(serverRdoc._id);
  const rdoc = wsUpdate ? { ...serverRdoc, ...wsUpdate } : serverRdoc;
  const udoc = args.udoc || {};
  const judgeUdoc = args.judge_udoc || args.judgeUdoc;
  const pdoc = args.pdoc || {};
  const tdoc = args.tdoc;
  const allRevs = args.allRevs || {};
  const rev = args.rev;

  const compilerTexts = asArray(rdoc.compilerTexts || rdoc.compilerText).filter(Boolean);
  const judgeTexts = asArray(rdoc.judgeTexts || rdoc.judgeText).filter(Boolean);
  const cases = normalizeCases(rdoc);
  const submitAt = objectIdDate(rdoc._id);
  const isJudging = rdoc.status === STATUS.STATUS_JUDGING || rdoc.status === STATUS.STATUS_COMPILING || rdoc.status === STATUS.STATUS_FETCHED;
  const recordId = String(rdoc._id || '').slice(-6);
  const scoreColor = rdoc.score === 100 ? 'green' : rdoc.score ? 'yellow' : 'gray';
  const isLimitStatus = shouldShowGreaterEqual(rdoc.status);
  const peakTime = cases.length ? Math.max(...cases.map((item) => Number(item.time) || 0)) : null;
  const codeLength = rdoc.code ? formatSize(new Blob([rdoc.code]).size) : '';
  const codeReplayUrl = buildReplayUrl(String(rdoc._id || ''), ui.codeReplayUrl);

  const submitOperation = async (operation: 'rejudge' | 'cancel') => {
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
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Operation failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else window.location.reload();
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setActionLoading('');
    }
  };

  return (
    <Stack gap="lg">
      {error && <Text c="red" size="sm">{error}</Text>}
      <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
        <Badge variant="light" color="hydroTeal" mb="sm">
          {t('Record')}
        </Badge>
        <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
          <div className="min-w-0">
            <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)] md:text-4xl">
              #{recordId || '-'}
            </Title>
            <Text size="sm" c="dimmed" mt="xs" className="truncate">
              {pdoc.pid || pdoc.docId ? `${pdoc.pid || pdoc.docId}. ${pdoc.title || ''}` : t('Submission detail')}
            </Text>
          </div>
          <Group gap="sm">
            {codeReplayUrl && canViewCodeReplay && (
              <Button component="a" href={codeReplayUrl} size="xs" variant="light">
                {t('Code Replay')}
              </Button>
            )}
            <RecordStatusBadge status={rdoc.status} size="lg" />
            {rdoc.score != null && (
              <Badge variant="light" color={scoreColor} size="lg">
                {rdoc.score}
              </Badge>
            )}
          </Group>
        </Group>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mt="lg">
          {rdoc.score != null && <Metric label={t('Score')} value={rdoc.score} />}
          {rdoc.time != null && <Metric label={t('Total Time')} value={`${isLimitStatus ? '>= ' : ''}${formatTime(rdoc.time)}`} />}
          {peakTime != null && <Metric label={t('Peak Time')} value={`${isLimitStatus ? '>= ' : ''}${formatTime(peakTime)}`} />}
          {rdoc.memory != null && <Metric label={t('Peak Memory')} value={`${isLimitStatus ? '>= ' : ''}${formatMemory(rdoc.memory)}`} />}
          {rdoc.lang && <Metric label={t('Language')} value={rdoc.lang} />}
        </SimpleGrid>
        {isJudging && (
          <Text c="blue" size="sm" mt="md" fw={600}>
            {t('Judging...')}
          </Text>
        )}
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Stack gap="md">
            {cases.length > 0 && (
              <Card withBorder p={0} className="hydro-content-card overflow-hidden">
                <Group justify="space-between" p="lg">
                  <Text size="sm" fw={700}>{t('Test Cases')}</Text>
                  <Badge variant="light">{cases.length}</Badge>
                </Group>
                <div className="border-t border-[var(--hydro-border)]">
                  <CaseTable cases={cases} subtasks={rdoc.subtasks || {}} />
                </div>
              </Card>
            )}

            {compilerTexts.length > 0 && (
              <OutputBlock title={t('Compiler Output')} content={compilerTexts.join('\n')} />
            )}

            {judgeTexts.length > 0 && (
              <OutputBlock title={t('Judge Message')} content={judgeTexts.join('\n')} />
            )}

            {rdoc.code && (
              <Card withBorder p="lg" className="hydro-content-card">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>{t('Source Code')}</Text>
                    {codeReplayUrl && canViewCodeReplay && (
                      <Button component="a" href={codeReplayUrl} size="xs" variant="light">
                        {t('Code Replay')}
                      </Button>
                    )}
                  </Group>
                  <div className="overflow-x-auto rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-bg-soft)]">
                    <Code block className="min-w-max bg-transparent p-3">{rdoc.code}</Code>
                  </div>
                </Stack>
              </Card>
            )}

            {rdoc.replay && rdoc.replay.length > 0 && (
              <Card withBorder p="lg" className="hydro-content-card">
                <Stack gap="sm">
                  <Text size="sm" fw={700}>{t('Code Replay')}</Text>
                  <CodeReplay events={rdoc.replay} initialCode="" language={rdoc.lang} />
                </Stack>
              </Card>
            )}
          </Stack>
        </div>

        <div className="w-full shrink-0 lg:w-72">
          <Stack gap="lg">
            {canJudge && !rdoc.files?.hack && (
              <Card withBorder p="md" className="hydro-panel">
                <Stack gap="xs">
                  <Button size="xs" variant="light" loading={actionLoading === 'rejudge'} onClick={() => submitOperation('rejudge')}>
                    {t('Rejudge')}
                  </Button>
                  <Button size="xs" variant="subtle" color="red" loading={actionLoading === 'cancel'} onClick={() => submitOperation('cancel')}>
                    {t('Cancel Score')}
                  </Button>
                </Stack>
              </Card>
            )}

            <Card withBorder p="md" className="hydro-panel">
              <Title order={3} size="h5" mb="sm">{t('Information')}</Title>
              <Stack gap={0}>
                <InfoRow label={t('Submit By')}>
                  <UserLink user={udoc} size="xs" />
                </InfoRow>
                {pdoc && (
                  <InfoRow label={t('Problem')}>
                    <Link to="problem_detail" params={{ pid: pdoc.pid || pdoc.docId }} className="block max-w-40 truncate text-xs no-underline hover:underline">
                      {pdoc.pid || pdoc.docId}. {pdoc.title}
                    </Link>
                  </InfoRow>
                )}
                {tdoc && (
                  <InfoRow label={t(tdoc.rule === 'homework' ? 'Homework' : 'Contest')}>
                    <Link to={tdoc.rule === 'homework' ? 'homework_detail' : 'contest_detail'} params={{ tid: tdoc.docId || tdoc._id }} className="block max-w-40 truncate text-xs no-underline hover:underline">
                      {tdoc.title}
                    </Link>
                  </InfoRow>
                )}
                <InfoRow label={t('Language')}>
                  <Text size="xs">{rdoc.lang || '-'}</Text>
                </InfoRow>
                {codeLength && (
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
            </Card>

            {Object.keys(allRevs).length > 0 && (
              <Card withBorder p="md" className="hydro-panel">
                <Title order={3} size="h5" mb="sm">{t('History')}</Title>
                <Stack gap={4}>
                  <Link to="record_detail" params={{ rid: rdoc._id }} className={`rounded-md px-2 py-1 text-xs no-underline ${!rev ? 'bg-[var(--hydro-primary-soft)] text-[var(--hydro-primary)]' : 'hover:bg-[var(--hydro-surface)]'}`}>
                    {t('Latest Version')}
                  </Link>
                  {Object.entries(allRevs).map(([rid, date]) => (
                    <a
                      key={rid}
                      href={`?rev=${rid}`}
                      className={`rounded-md px-2 py-1 text-xs no-underline ${String(rev) === rid ? 'bg-[var(--hydro-primary-soft)] text-[var(--hydro-primary)]' : 'hover:bg-[var(--hydro-surface)]'}`}
                    >
                      <TimeDisplay date={date as any} format="absolute" />
                    </a>
                  ))}
                </Stack>
              </Card>
            )}
          </Stack>
        </div>
      </div>
    </Stack>
  );
}
