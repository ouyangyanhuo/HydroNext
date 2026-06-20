import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { useState, useCallback, useMemo, type ReactNode, useRef, useEffect } from 'react';
import {
  ActionIcon, Badge, Button, Divider, Drawer, Group, NumberInput,
  Paper, Select, Stack, Tabs, Text, Textarea, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlayerPlay, IconSend, IconSettings, IconX } from '@tabler/icons-react';
import {
  CodeEditor,
  EDITOR_THEME_OPTIONS,
  loadStoredEditorConfig,
  saveStoredEditorConfig,
  type EditorConfig,
} from './code-editor';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { STATUS_TEXTS } from '@/components/record/status-map';
import { useI18n } from '@/hooks/use-i18n';
import { useRecordSocket } from '@/hooks/use-record-socket';
import { useNavigate } from '@/context/router';
import { useUiContext, useUserContext } from '@/context/page-data';

interface ScratchpadProps {
  pid: string | number;
  langs: Record<string, any>;
  defaultCode?: string;
  defaultLang?: string;
  statement?: ReactNode;
  title?: string;
  onClose?: () => void;
  onSubmit?: (lang: string, code: string) => Promise<any>;
  submitUrl?: string;
  codeReplaySessionUrl?: string;
}

interface ReplayEvent {
  t: number;
  lang?: string;
  changes: {
    rangeOffset: number;
    rangeLength: number;
    text: string;
    range?: unknown;
  }[];
  selections?: unknown[];
}

interface ReplaySnapshot {
  t: number;
  code: string;
  lang?: string;
}

function randomSessionId() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 32);
}

function getStoredNumber(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getStoredString(key: string, fallback: string) {
  return localStorage.getItem(key) || fallback;
}

function getScratchpadCacheKey(userId: string | number | undefined, domainId: string | undefined, pid: string | number, contestId?: string | number) {
  let key = `${userId || 'guest'}/${domainId || ''}/${pid}`;
  if (contestId) key += `@${contestId}`;
  return key;
}

function getSelections(editor: any) {
  return editor.getSelections?.()?.map((selection: any) => ({
    startLineNumber: selection.startLineNumber,
    startColumn: selection.startColumn,
    endLineNumber: selection.endLineNumber,
    endColumn: selection.endColumn,
  }));
}

export function Scratchpad({
  pid,
  langs,
  defaultCode = '',
  defaultLang = '',
  statement,
  title,
  onClose,
  onSubmit,
  submitUrl,
  codeReplaySessionUrl,
}: ScratchpadProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const ui = useUiContext();
  const user = useUserContext();
  const langOptions = useMemo(() => Object.entries(langs).map(([id, info]: [string, any]) => ({
    value: id,
    label: info.display || info.name || id,
  })), [langs]);
  const contestId = ui.tdoc?._id || ui.tdoc?.docId || new URLSearchParams(window.location.search).get('tid') || '';
  const cacheKey = useMemo(
    () => getScratchpadCacheKey(user?._id, ui.domainId, pid, contestId),
    [contestId, pid, ui.domainId, user?._id],
  );
  const [lang, setLang] = useState(() => {
    const cachedLang = getStoredString(`${cacheKey}#lang`, defaultLang);
    if (cachedLang && langOptions.some((option) => option.value === cachedLang)) return cachedLang;
    if (defaultLang && langOptions.some((option) => option.value === defaultLang)) return defaultLang;
    return langOptions[0]?.value || '';
  });
  const [code, setCode] = useState(() => {
    const cached = localStorage.getItem(cacheKey);
    return cached == null ? defaultCode : cached;
  });
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pretesting, setPretesting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [pretestResult, setPretestResult] = useState<any>(null);
  const [pretestRid, setPretestRid] = useState<string>();
  const [error, setError] = useState('');
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [editorConfig, setEditorConfig] = useState<EditorConfig>(() => loadStoredEditorConfig());
  const [cooldownUntil, setCooldownUntil] = useState({ pretest: 0, submit: 0 });
  const [viewportWidth, setViewportWidth] = useState(() => document.documentElement.clientWidth || window.innerWidth);
  const [, setClock] = useState(Date.now());
  const fontSize = Number(editorConfig.fontSize || getStoredNumber('hydro/editor/fontSize', 14));
  const tabSize = Number(editorConfig.tabSize || getStoredNumber('hydro/editor/tabSize', 4));
  const theme = editorConfig.theme || '';
  const replayRef = useRef({
    sessionId: '',
    initialCode: defaultCode,
    startedAt: Date.now(),
    events: [] as ReplayEvent[],
    snapshots: [] as ReplaySnapshot[],
    lastSnapshotAt: 0,
    flushing: false,
  });
  const pretestUpdate = useRecordSocket(pretestRid);

  const resolvedSubmitUrl = submitUrl || `/p/${pid}/submit${window.location.search || ''}`;
  const resolvedReplayUrl = codeReplaySessionUrl || ui.codeReplaySessionUrl;
  const canUsePretest = useMemo(() => {
    const info = langs[lang] || {};
    if (info.pretest === false) return false;
    if (info.pretest) return true;
    const type = ui.pdoc?.config?.type;
    return !type || type === 'default' || type === 'remote_judge';
  }, [lang, langs, ui.pdoc?.config?.type]);

  const updateEditorConfig = useCallback((patch: EditorConfig) => {
    setEditorConfig((current) => {
      const next = { ...current, ...patch };
      Object.keys(next).forEach((key) => {
        if ((next as any)[key] === undefined || (next as any)[key] === '') delete (next as any)[key];
      });
      saveStoredEditorConfig(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const update = () => setViewportWidth(document.documentElement.clientWidth || window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    localStorage.setItem(cacheKey, code);
  }, [cacheKey, code]);

  useEffect(() => {
    if (lang) localStorage.setItem(`${cacheKey}#lang`, lang);
  }, [cacheKey, lang]);

  useEffect(() => {
    if (!pretestUpdate) return;
    setPretestResult((current: any) => ({ ...(current || {}), ...pretestUpdate, rid: pretestRid }));
  }, [pretestRid, pretestUpdate]);

  const ensureReplaySession = useCallback(() => {
    const replay = replayRef.current;
    if (replay.sessionId) return replay.sessionId;
    const key = `code-replay/${user?._id || 'guest'}/${ui.domainId || ''}/${pid}${contestId ? `@${contestId}` : ''}`;
    let sessionId = sessionStorage.getItem(key);
    if (!sessionId) {
      sessionId = randomSessionId();
      sessionStorage.setItem(key, sessionId);
    }
    replay.sessionId = sessionId;
    replay.initialCode = code;
    replay.startedAt = Date.now();
    replay.events = [];
    replay.snapshots = [{ t: 0, code, lang }];
    replay.lastSnapshotAt = 0;
    return sessionId;
  }, [code, contestId, lang, pid, ui.domainId, user?._id]);

  const captureChange = useCallback((event: any, editor: any) => {
    if (!resolvedReplayUrl || !user?._id) return;
    ensureReplaySession();
    const replay = replayRef.current;
    const t = Date.now() - replay.startedAt;
    replay.events.push({
      t,
      lang,
      selections: getSelections(editor),
      changes: (event.changes || []).map((change: any) => ({
        rangeOffset: change.rangeOffset,
        rangeLength: change.rangeLength,
        text: change.text,
        range: change.range,
      })),
    });
    if (t - replay.lastSnapshotAt > 30000) {
      replay.lastSnapshotAt = t;
      replay.snapshots.push({ t, code: editor.getValue(), lang });
    }
  }, [ensureReplaySession, lang, resolvedReplayUrl, user?._id]);

  const flushReplay = useCallback(async (finalCode: string) => {
    if (!resolvedReplayUrl || !user?._id) return '';
    const sessionId = ensureReplaySession();
    const replay = replayRef.current;
    const events = replay.events.splice(0);
    const snapshots = replay.snapshots.splice(0);
    snapshots.push({ t: Date.now() - replay.startedAt, code: finalCode, lang });
    if (!events.length && snapshots.length <= 1) return sessionId;
    replay.flushing = true;
    try {
      const tid = ui.tdoc?._id || ui.tdoc?.docId || new URLSearchParams(window.location.search).get('tid') || undefined;
      await fetch(resolvedReplayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sessionId,
          pid: ui.pdoc?.docId || pid,
          tid,
          lang,
          initialCode: replay.initialCode,
          finalCode,
          events,
          snapshots,
        }),
      });
    } catch (err) {
      replay.events.unshift(...events);
      replay.snapshots.unshift(...snapshots);
      console.warn('Failed to flush code replay:', err);
    } finally {
      replay.flushing = false;
    }
    return sessionId;
  }, [ensureReplaySession, lang, pid, resolvedReplayUrl, ui.pdoc?.docId, ui.tdoc, user?._id]);

  const postJudge = useCallback(async (pretest: boolean) => {
    const now = Date.now();
    if (now < (pretest ? cooldownUntil.pretest : cooldownUntil.submit)) return;
    if (!lang) {
      notifications.show({ title: t('Please select a language'), message: '', color: 'red' });
      setError(t('Please select a language'));
      return;
    }
    if (!code.trim()) {
      notifications.show({ title: t('Please enter your code'), message: '', color: 'red' });
      setError(t('Please enter your code'));
      return;
    }
    setCooldownUntil((current) => ({ ...current, [pretest ? 'pretest' : 'submit']: now + 10000 }));
    if (pretest) setPretesting(true);
    else setSubmitting(true);
    setError('');
    if (pretest) setPretestResult(null);
    else setSubmitResult(null);

    try {
      if (!pretest && onSubmit) {
        const res = await onSubmit(lang, code);
        setSubmitResult(res);
      } else {
        const replaySessionId = pretest ? '' : await flushReplay(code);
        const res = await fetch(resolvedSubmitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            lang,
            code,
            input: pretest ? [input] : undefined,
            pretest,
            codeReplaySessionId: replaySessionId || undefined,
          }),
        });
        const data = await res.json();
        if (data.error) setError(data.error.message || 'Submission failed');
        else if (pretest) {
          setPretestResult(data);
          if (data.rid) setPretestRid(String(data.rid));
        }
        else if (data.rid) navigate(`/record/${data.rid}`);
        else setSubmitResult(data);
      }
    } catch { setError('Network error'); }
    finally {
      if (pretest) setPretesting(false);
      else setSubmitting(false);
    }
  }, [cooldownUntil.pretest, cooldownUntil.submit, lang, code, t, onSubmit, flushReplay, resolvedSubmitUrl, input, navigate]);

  const pretestCooldown = Math.max(0, Math.ceil((cooldownUntil.pretest - Date.now()) / 1000));
  const submitCooldown = Math.max(0, Math.ceil((cooldownUntil.submit - Date.now()) / 1000));

  const renderResult = (result: any, emptyText: string) => {
    if (error) return <Text c="red" size="sm">{error}</Text>;
    if (!result) return <Text size="sm" c="dimmed">{emptyText}</Text>;
    return (
      <Stack gap="xs">
        <Group gap="xs">
          {result.status !== undefined && <RecordStatusBadge status={result.status} size="xs" />}
          {result.score !== undefined && <Badge size="xs">{result.score}</Badge>}
          {result.rid && (
            <Button variant="subtle" size="xs" onClick={() => navigate(`/record/${result.rid}`)}>
              {t('View Record')}
            </Button>
          )}
        </Group>
        {(result.compilerTexts || result.compilerText || result.judgeTexts || result.judgeText || result.message || result.output || result.testCases || result.cases) && (
          <Text size="xs" className="whitespace-pre-wrap font-mono">
            {[
              ...(Array.isArray(result.compilerTexts) ? result.compilerTexts : [result.compilerText]).filter(Boolean),
              ...(Array.isArray(result.judgeTexts) ? result.judgeTexts : [result.judgeText]).filter(Boolean),
              ...((result.testCases || result.cases || []).map((item: any, index: number) => (
                item.message ? `#${item.id ?? index + 1} ${item.message}` : ''
              ))),
              result.message,
              result.output,
            ].filter(Boolean).join('\n')}
          </Text>
        )}
      </Stack>
    );
  };

  const renderPretestOutput = (result: any) => {
    if (error) return <Text c="red" size="sm">{error}</Text>;
    if (!result) return <Text size="sm" c="dimmed">{t('No result')}</Text>;
    const lines: string[] = [];
    if (result.status !== undefined) {
      lines.push(`${t(STATUS_TEXTS[result.status] || String(result.status))} ${Math.round(Number(result.time) || 0)}ms ${Math.round(Number(result.memory) || 0)}KiB`);
    } else if (result.rid) {
      lines.push(t('Waiting'));
    }
    if (Array.isArray(result.compilerTexts) && result.compilerTexts.length) lines.push(result.compilerTexts.join('\n'));
    else if (result.compilerText) lines.push(String(result.compilerText));
    const firstCase = (result.testCases || result.cases || [])[0];
    if (firstCase?.message) lines.push(firstCase.message);
    if (!lines.length && result.message) lines.push(String(result.message));
    if (!lines.length && result.output) lines.push(String(result.output));
    return (
      <Text size="xs" className="whitespace-pre-wrap font-mono">
        {lines.filter(Boolean).join('\n') || t('No result')}
      </Text>
    );
  };

  return (
    <div
      className="relative -my-8 overflow-hidden md:-my-10"
      style={{
        width: viewportWidth ? `${viewportWidth}px` : '100vw',
        marginLeft: viewportWidth ? `calc(50% - ${viewportWidth / 2}px)` : 'calc(50% - 50vw)',
        marginRight: viewportWidth ? `calc(50% - ${viewportWidth / 2}px)` : 'calc(50% - 50vw)',
        maxWidth: '100vw',
      }}
    >
      <Paper className="h-[calc(100vh-4rem)] min-h-[560px] overflow-hidden rounded-none border-x-0 border-y border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
        <Allotment>
          {statement && (
            <Allotment.Pane preferredSize="38%" minSize={280}>
              <div className="h-full overflow-auto border-r border-[var(--hydro-border)] p-5">
                <Group justify="space-between" mb="md" align="flex-start">
                  <div>
                    <Text size="xs" c="dimmed" fw={800}>{t('Problem')}</Text>
                    {title && <Title order={3} size="h4">{title}</Title>}
                  </div>
                </Group>
                {statement}
              </div>
            </Allotment.Pane>
          )}

          <Allotment.Pane minSize={420}>
            <Stack gap={0} className="h-full min-h-0">
              <Group justify="space-between" p="xs" className="border-b border-[var(--hydro-border)] bg-[var(--hydro-surface)]">
                <Group gap="xs" wrap="nowrap">
                  <Select
                    data={langOptions}
                    value={lang}
                    onChange={(v) => setLang(v || '')}
                    placeholder={t('Language')}
                    searchable
                    size="xs"
                    w={190}
                  />
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {canUsePretest && (
                    <Button
                      size="xs"
                      leftSection={<IconPlayerPlay size={14} />}
                      onClick={() => postJudge(true)}
                      loading={pretesting}
                      disabled={submitting || pretestCooldown > 0}
                    >
                      {pretestCooldown ? `${t('Run Self Test')} (${pretestCooldown}s)` : t('Run Self Test')}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    leftSection={<IconSend size={14} />}
                    onClick={() => postJudge(false)}
                    loading={submitting}
                    disabled={pretesting || submitCooldown > 0}
                  >
                    {submitCooldown ? `${t('Submit Solution')} (${submitCooldown}s)` : t('Submit Solution')}
                  </Button>
                  <Tooltip label={t('Editor Settings')}>
                    <ActionIcon variant="subtle" onClick={() => setSettingsOpened(true)} aria-label={t('Editor Settings')}>
                      <IconSettings size={18} />
                    </ActionIcon>
                  </Tooltip>
                  {onClose && (
                    <Tooltip label={t('Quit Scratchpad')}>
                      <ActionIcon size="lg" variant="subtle" color="gray" onClick={onClose} aria-label={t('Quit Scratchpad')}>
                        <IconX size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>

              <div className="min-h-0 flex-1">
                <Allotment vertical>
                  <Allotment.Pane minSize={320}>
                    <CodeEditor
                      value={code}
                      onChange={setCode}
                      onContentChange={captureChange}
                      language={lang}
                      height="100%"
                      fontSize={fontSize}
                      tabSize={tabSize}
                      theme={theme}
                    />
                  </Allotment.Pane>
                  <Allotment.Pane preferredSize={180} minSize={120}>
                    <Stack gap={0} className="h-full">
                      <Divider />
                      <Tabs defaultValue="records" keepMounted={false} className="flex h-full flex-col">
                        <Tabs.List px="xs">
                          <Tabs.Tab value="records">{t('Records')}</Tabs.Tab>
                          <Tabs.Tab value="pretest">{t('Self Test')}</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="records" className="min-h-0 flex-1">
                          <Paper p="sm" className="h-full overflow-auto border-t border-[var(--hydro-border)]">
                            {renderResult(submitResult, t('No records found'))}
                          </Paper>
                        </Tabs.Panel>
                        <Tabs.Panel value="pretest" className="min-h-0 flex-1">
                          <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-2">
                            <Paper p="sm" className="h-full min-h-0 overflow-auto rounded-none border-t border-[var(--hydro-border)]">
                              <Text size="xs" c="dimmed" fw={700} mb={6}>{t('Input')}</Text>
                              <Textarea
                                value={input}
                                onChange={(e) => setInput(e.currentTarget.value)}
                                placeholder={t('Input')}
                                minRows={4}
                                autosize
                                styles={{ input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '13px' } }}
                              />
                            </Paper>
                            <Paper p="sm" className="h-full min-h-0 overflow-auto rounded-none border-t border-l border-[var(--hydro-border)]">
                              <Text size="xs" c="dimmed" fw={700} mb={6}>{t('Output')}</Text>
                              {renderPretestOutput(pretestResult)}
                            </Paper>
                          </div>
                        </Tabs.Panel>
                      </Tabs>
                    </Stack>
                  </Allotment.Pane>
                </Allotment>
              </div>
            </Stack>
          </Allotment.Pane>
        </Allotment>
      </Paper>

      <Drawer opened={settingsOpened} onClose={() => setSettingsOpened(false)} title={t('Editor Settings')} position="right">
        <Stack gap="md">
          <NumberInput
            label={t('Font Size')}
            value={fontSize}
            min={10}
            max={28}
            step={1}
            onChange={(value) => updateEditorConfig({ fontSize: Number(value) || 14 })}
          />
          <NumberInput
            label={t('Tab Size')}
            value={tabSize}
            min={2}
            max={8}
            step={1}
            onChange={(value) => updateEditorConfig({ tabSize: Number(value) || 4 })}
          />
          <Select
            label={t('Editor Theme')}
            data={EDITOR_THEME_OPTIONS}
            value={theme}
            onChange={(value) => updateEditorConfig({ theme: value || undefined })}
            searchable
            clearable
          />
        </Stack>
      </Drawer>
    </div>
  );
}
