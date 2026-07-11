import 'allotment/dist/style.css';

import {
  ActionIcon, Badge, Button, Divider, Drawer, Group, NumberInput,
  Paper, Select, Stack, Text, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCode, IconFileText, IconPlayerPlay, IconSend, IconSettings, IconTerminal2, IconX,
} from '@tabler/icons-react';
import { Allotment } from 'allotment';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { STATUS_TEXTS } from '@/components/record/status-map';
import { useUiContext, useUserContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { useRecordSocket } from '@/hooks/use-record-socket';
import {
  CodeEditor,
  EDITOR_THEME_OPTIONS,
  type EditorConfig,
  loadStoredEditorConfig,
  saveStoredEditorConfig,
} from './code-editor';

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
  const buildUrl = useBuildUrl();
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
    return cached ?? defaultCode;
  });
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pretesting, setPretesting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [pretestResult, setPretestResult] = useState<any>(null);
  const [pretestRid, setPretestRid] = useState<string>();
  const [error, setError] = useState('');
  const [activePanel, setActivePanel] = useState<string | null>('records');
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [editorConfig, setEditorConfig] = useState<EditorConfig>(() => loadStoredEditorConfig());
  const [cooldownUntil, setCooldownUntil] = useState({ pretest: 0, submit: 0 });
  const [viewportWidth, setViewportWidth] = useState(() => document.documentElement.clientWidth || window.innerWidth);
  const [clock, setClock] = useState(() => Date.now());
  const fontSize = Number(editorConfig.fontSize || getStoredNumber('hydro/editor/fontSize', 14));
  const tabSize = Number(editorConfig.tabSize || getStoredNumber('hydro/editor/tabSize', 4));
  const theme = editorConfig.theme || '';
  const replayRef = useRef({
    sessionId: '',
    initialCode: defaultCode,
    startedAt: 0,
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
    const cooldownEnd = Math.max(cooldownUntil.pretest, cooldownUntil.submit);
    if (cooldownEnd <= Date.now()) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= cooldownEnd) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil.pretest, cooldownUntil.submit]);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const nextWidth = document.documentElement.clientWidth || window.innerWidth;
        setViewportWidth((current) => (current === nextWidth ? current : nextWidth));
      });
    };
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(cacheKey, code);
  }, [cacheKey, code]);

  useEffect(() => {
    if (lang) localStorage.setItem(`${cacheKey}#lang`, lang);
  }, [cacheKey, lang]);

  const displayedPretestResult = pretestUpdate
    ? { ...(pretestResult || {}), ...pretestUpdate, rid: pretestRid }
    : pretestResult;

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
    const elapsed = Date.now() - replay.startedAt;
    replay.events.push({
      t: elapsed,
      lang,
      selections: getSelections(editor),
      changes: (event.changes || []).map((change: any) => ({
        rangeOffset: change.rangeOffset,
        rangeLength: change.rangeLength,
        text: change.text,
        range: change.range,
      })),
    });
    if (elapsed - replay.lastSnapshotAt > 30000) {
      replay.lastSnapshotAt = elapsed;
      replay.snapshots.push({ t: elapsed, code: editor.getValue(), lang });
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
  }, [ensureReplaySession, lang, pid, resolvedReplayUrl, ui.pdoc, ui.tdoc, user?._id]);

  const postJudge = useCallback(async (pretest: boolean) => {
    const now = Date.now();
    if (now < (pretest ? cooldownUntil.pretest : cooldownUntil.submit)) return;
    setClock(now);
    setActivePanel(pretest ? 'pretest' : 'records');
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
        } else if (data.rid) navigate(buildUrl('record_detail', { rid: data.rid }));
        else setSubmitResult(data);
      }
    } catch { setError('Network error'); } finally {
      if (pretest) setPretesting(false);
      else setSubmitting(false);
    }
  }, [buildUrl, cooldownUntil.pretest, cooldownUntil.submit, lang, code, t, onSubmit, flushReplay, resolvedSubmitUrl, input, navigate]);

  const pretestCooldown = Math.max(0, Math.ceil((cooldownUntil.pretest - clock) / 1000));
  const submitCooldown = Math.max(0, Math.ceil((cooldownUntil.submit - clock) / 1000));

  const renderResult = (result: any, emptyText: string) => {
    if (error) return <Text c="red" size="sm">{error}</Text>;
    if (!result) return <Text size="sm" c="dimmed">{emptyText}</Text>;
    const hasResultDetails = Boolean(
      result.compilerTexts || result.compilerText || result.judgeTexts || result.judgeText
      || result.message || result.output || result.testCases || result.cases,
    );
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
        {hasResultDetails && (
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
      const statusText = t(STATUS_TEXTS[result.status] || String(result.status));
      const timeText = `${Math.round(Number(result.time) || 0)}ms`;
      const memoryText = `${Math.round(Number(result.memory) || 0)}KiB`;
      lines.push(`${statusText} ${timeText} ${memoryText}`);
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
      className="hydro-scratchpad-shell relative -my-8 overflow-hidden md:-my-10"
      style={{
        width: viewportWidth ? `${viewportWidth}px` : '100vw',
        marginLeft: viewportWidth ? `calc(50% - ${viewportWidth / 2}px)` : 'calc(50% - 50vw)',
        marginRight: viewportWidth ? `calc(50% - ${viewportWidth / 2}px)` : 'calc(50% - 50vw)',
        maxWidth: '100vw',
      }}
    >
      <Paper
        className={[
          'hydro-scratchpad-frame h-[calc(100dvh-4rem)] min-h-[560px] overflow-hidden rounded-none',
          'border-x-0 border-y border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]',
        ].join(' ')}
      >
        <Allotment vertical={viewportWidth < 900}>
          {statement && (
            <Allotment.Pane preferredSize={viewportWidth < 900 ? '42%' : '38%'} minSize={viewportWidth < 900 ? 180 : 280}>
              <div className="hydro-scratchpad-statement h-full overflow-auto">
                <div className="hydro-scratchpad-statement__header">
                  <Group gap="sm" align="flex-start" wrap="nowrap">
                    <span className="hydro-scratchpad-pane-icon" aria-hidden="true">
                      <IconFileText size={17} stroke={1.8} />
                    </span>
                    <div className="min-w-0">
                      <Text size="xs" c="dimmed" fw={800}>{t('Problem')}</Text>
                      {title && <Title order={3} size="h4" className="truncate">{title}</Title>}
                    </div>
                  </Group>
                </div>
                <div className="hydro-scratchpad-statement__body">
                  {statement}
                </div>
              </div>
            </Allotment.Pane>
          )}

          <Allotment.Pane minSize={viewportWidth < 900 ? 320 : 420}>
            <Stack gap={0} className="hydro-scratchpad-editor-pane h-full min-h-0">
              <div className="hydro-scratchpad-toolbar">
                <Group gap="sm" wrap="nowrap" className="hydro-scratchpad-toolbar__language">
                  <span className="hydro-scratchpad-pane-icon" aria-hidden="true">
                    <IconCode size={17} stroke={1.8} />
                  </span>
                  <Select
                    data={langOptions}
                    value={lang}
                    onChange={(v) => setLang(v || '')}
                    placeholder={t('Language')}
                    searchable
                    size="xs"
                    className="hydro-scratchpad-language-select"
                    classNames={{ dropdown: 'hydro-scratchpad-select-dropdown' }}
                  />
                </Group>
                <Group gap="xs" wrap="nowrap" className="hydro-scratchpad-toolbar__actions">
                  {canUsePretest && (
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPlayerPlay size={14} />}
                      onClick={() => postJudge(true)}
                      loading={pretesting}
                      disabled={submitting || pretestCooldown > 0}
                      className="hydro-scratchpad-run-action"
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
                    className="hydro-scratchpad-submit-action"
                  >
                    {submitCooldown ? `${t('Submit Solution')} (${submitCooldown}s)` : t('Submit Solution')}
                  </Button>
                  <Tooltip label={t('Editor Settings')}>
                    <ActionIcon
                      className="hydro-scratchpad-tool-action"
                      variant="subtle"
                      onClick={() => setSettingsOpened(true)}
                      aria-label={t('Editor Settings')}
                    >
                      <IconSettings size={18} />
                    </ActionIcon>
                  </Tooltip>
                  {onClose && (
                    <Tooltip label={t('Quit Scratchpad')}>
                      <ActionIcon
                        className="hydro-scratchpad-tool-action"
                        size="lg"
                        variant="subtle"
                        onClick={onClose}
                        aria-label={t('Quit Scratchpad')}
                      >
                        <IconX size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </div>

              <div className="hydro-scratchpad-editor min-h-0 flex-1">
                <Allotment vertical>
                  <Allotment.Pane minSize={260}>
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
                  <Allotment.Pane preferredSize={190} minSize={130}>
                    <Stack gap={0} className="hydro-scratchpad-console h-full min-h-0 overflow-hidden">
                      <Divider />
                      <div className="hydro-scratchpad-console-workspace">
                        <div className="hydro-scratchpad-console__tabs" role="tablist" aria-label={t('Self Test')}>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={activePanel === 'records'}
                            className="hydro-scratchpad-console__tab"
                            onClick={() => setActivePanel('records')}
                          >
                            {t('Records')}
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={activePanel === 'pretest'}
                            className="hydro-scratchpad-console__tab"
                            onClick={() => setActivePanel('pretest')}
                          >
                            <IconTerminal2 size={14} />
                            {t('Self Test')}
                          </button>
                        </div>
                        <div className="hydro-scratchpad-console__body">
                          {activePanel === 'records' ? (
                            <div className="hydro-scratchpad-console__panel">
                              {renderResult(submitResult, t('No records found'))}
                            </div>
                          ) : (
                            <div className="hydro-scratchpad-io-grid">
                              <section className="hydro-scratchpad-io-panel">
                                <header className="hydro-scratchpad-io-panel__header">
                                  <Text size="xs" fw={750}>{t('Input')}</Text>
                                  <Text size="xs" c="dimmed">stdin</Text>
                                </header>
                                <textarea
                                  value={input}
                                  onChange={(event) => setInput(event.currentTarget.value)}
                                  placeholder={`${t('Input')}…`}
                                  className="hydro-scratchpad-input"
                                  aria-label={`${t('Self Test')} ${t('Input')}`}
                                  spellCheck={false}
                                />
                              </section>
                              <section className="hydro-scratchpad-io-panel hydro-scratchpad-io-panel--output">
                                <header className="hydro-scratchpad-io-panel__header">
                                  <Text size="xs" fw={750}>{t('Output')}</Text>
                                  <Text size="xs" c="dimmed">stdout / stderr</Text>
                                </header>
                                <div
                                  className="hydro-scratchpad-output font-mono text-xs"
                                  tabIndex={0}
                                  aria-label={`${t('Self Test')} ${t('Output')}`}
                                >
                                  {renderPretestOutput(displayedPretestResult)}
                                </div>
                              </section>
                            </div>
                          )}
                        </div>
                      </div>
                    </Stack>
                  </Allotment.Pane>
                </Allotment>
              </div>

              <div className="hydro-scratchpad-statusbar">
                <Text size="xs" fw={700}>{langOptions.find((option) => option.value === lang)?.label || lang || t('Language')}</Text>
                <Group gap="md" wrap="nowrap">
                  <Text size="xs" c="dimmed">{t('Font Size')}: {fontSize}px</Text>
                  <Text size="xs" c="dimmed">{t('Tab Size')}: {tabSize}</Text>
                </Group>
              </div>
            </Stack>
          </Allotment.Pane>
        </Allotment>
      </Paper>

      <Drawer
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        title={t('Editor Settings')}
        position="right"
        classNames={{ content: 'hydro-scratchpad-settings', header: 'hydro-scratchpad-settings__header' }}
      >
        <Stack gap="md" className="hydro-scratchpad-settings__form">
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
            classNames={{ dropdown: 'hydro-scratchpad-select-dropdown' }}
          />
        </Stack>
      </Drawer>
    </div>
  );
}
