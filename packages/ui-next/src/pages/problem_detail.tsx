import { Badge, Button, Card, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { FilePreviewModal } from '@/components/common/file-preview-modal';
import { FormDialog } from '@/components/common/form-dialog';
import { TimeDisplay } from '@/components/common/time-display';
import { Scratchpad } from '@/components/editor/scratchpad';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { UserAvatar } from '@/components/user/user-avatar';
import { UserLink } from '@/components/user/user-link';
import { usePageData, useUiContext, useUserContext } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, PERM, useHasPerm } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';
import { extractLocalizedContent } from '@/utils/i18n-content';
import { getLangDisplay } from '@/utils/lang-display';

function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

async function downloadProblemZip(pdoc: any, title: string) {
  const [{ zipSync, strToU8 }, yaml] = await Promise.all([
    import('fflate'),
    import('js-yaml'),
  ]);
  const root = String(pdoc.docId || pdoc.pid || 'problem');
  const files: Record<string, Uint8Array> = {};
  files[`${root}/problem.yaml`] = strToU8(yaml.dump({
    pid: pdoc.pid,
    owner: pdoc.owner,
    title: pdoc.title,
    tag: pdoc.tag,
    nSubmit: pdoc.nSubmit,
    nAccept: pdoc.nAccept,
    difficulty: pdoc.difficulty,
  }));

  const content = parseContentObject(pdoc.content);
  if (content) {
    for (const [lang, value] of Object.entries(content)) {
      files[`${root}/problem_${lang}.md`] = strToU8(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    }
  } else {
    files[`${root}/problem.md`] = strToU8(String(pdoc.content || ''));
  }

  async function addRemoteFiles(type: 'testdata' | 'additional_file', list: any[], dirname: string) {
    if (!list?.length) return;
    const res = await fetch(`/p/${pdoc.pid || pdoc.docId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ operation: 'get_links', files: list.map((file) => file.name), type }),
    });
    const data = await res.json();
    if (!data.links) return;
    for (const [filename, url] of Object.entries<string>(data.links)) {
      const fileRes = await fetch(url);
      if (!fileRes.ok) continue;
      files[`${root}/${dirname}/${filename}`] = new Uint8Array(await fileRes.arrayBuffer());
    }
  }

  await addRemoteFiles('testdata', pdoc.data || [], 'testdata');
  await addRemoteFiles('additional_file', pdoc.additional_file || [], 'additional_file');

  const blob = new Blob([zipSync(files)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(title || root)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseContentObject(content: any): Record<string, any> | null {
  if (!content) return null;
  if (typeof content === 'object') return content;
  if (typeof content === 'string' && content.trim().startsWith('{') && content.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function contentLanguages(content: any) {
  const obj = parseContentObject(content);
  return obj ? Object.keys(obj).filter((key) => obj[key]) : [];
}

function langLabel(lang: string) {
  const labels: Record<string, string> = {
    zh: '中文',
    zh_CN: '简体中文',
    zh_TW: '繁體中文',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
  };
  return labels[lang] || lang;
}

function estimateDifficulty(problem: any) {
  if (problem.difficulty !== undefined && problem.difficulty !== null) return String(problem.difficulty);
  const submit = Number(problem.nSubmit || 0);
  const accept = Number(problem.nAccept || 0);
  if (!submit) return '-';
  const rate = accept / submit;
  if (rate >= 0.65) return '1';
  if (rate >= 0.45) return '2';
  if (rate >= 0.3) return '3';
  if (rate >= 0.15) return '4';
  return '5';
}

function formatMemory(pdoc: any) {
  const config = pdoc.config || {};
  if (config.memoryMin && config.memoryMax && config.memoryMin !== config.memoryMax) return `${config.memoryMin}~${config.memoryMax}MiB`;
  if (config.memoryMax || config.memoryMin) return `${config.memoryMax || config.memoryMin}MiB`;
  if (pdoc.limits?.memory) return `${Math.round(pdoc.limits.memory / 1024)}MB`;
  return '-';
}

function formatTime(pdoc: any) {
  const config = pdoc.config || {};
  if (config.timeMin && config.timeMax && config.timeMin !== config.timeMax) return `${config.timeMin}~${config.timeMax}ms`;
  if (config.timeMax || config.timeMin) return `${config.timeMax || config.timeMin}ms`;
  if (pdoc.limits?.time) return `${pdoc.limits.time}ms`;
  return '-';
}

function ProblemMeta({ pdoc, owner }: { pdoc: any, owner?: any }) {
  const { t } = useI18n();
  const items = [
    { label: 'ID', value: String(pdoc.docId || pdoc.pid || '-') },
    { label: t('Time Limit'), value: formatTime(pdoc) },
    { label: t('Memory Limit'), value: formatMemory(pdoc) },
    { label: t('Problem Type'), value: t(`problemType::${pdoc.config?.type || 'default'}`) },
    { label: t('Tried'), value: String(pdoc.nSubmit ?? '-') },
    { label: t('Accepted'), value: String(pdoc.nAccept ?? '-') },
    { label: t('Difficulty'), value: estimateDifficulty(pdoc) },
  ];

  return (
    <div className="flex flex-wrap divide-x divide-[var(--hydro-border)] rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)]">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center px-3 py-2">
          <Text size="xs" c="dimmed" fw={700}>{item.label}</Text>
          <Text size="sm" fw={800} className="text-[var(--hydro-text)]">{item.value}</Text>
        </div>
      ))}
      {owner && (
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-3 py-2">
          <UserAvatar user={owner} size={24} link={false} />
          <div className="min-w-0">
            <Text size="xs" c="dimmed" fw={700}>{t('Uploaded By')}</Text>
            <UserLink user={owner} size="sm" />
          </div>
        </div>
      )}
    </div>
  );
}

function ProblemTags({ tags }: { tags?: string[] }) {
  const { t } = useI18n();
  if (!tags?.length) return null;
  return (
    <Group gap={6} mt="md">
      <Text size="xs" c="dimmed" fw={700}>{t('Tags')}</Text>
      {tags.map((tag) => (
        <Badge key={tag} size="sm" variant="light" color="gray">
          {tag}
        </Badge>
      ))}
    </Group>
  );
}

function SidebarLinkButton({ href, children, variant = 'subtle' }: { href: string, children: React.ReactNode, variant?: 'filled' | 'light' | 'subtle' | 'default' }) {
  return (
    <Button component={Link} href={href} variant={variant} fullWidth size="sm" justify="flex-start">
      {children}
    </Button>
  );
}

function ProblemSidebar({
  pdoc, psdoc, rdoc, onToggleScratchpad, scratchpadOpen,
  contestClosed, canSubmitProblem, canEditProblem, canConfigureProblem,
  canRejudgeProblem, canViewProblemSolution,
}: {
  pdoc: any;
  psdoc?: any;
  rdoc?: any;
  onToggleScratchpad: () => void;
  scratchpadOpen: boolean;
  contestClosed?: boolean;
  canSubmitProblem?: boolean;
  canEditProblem?: boolean;
  canConfigureProblem?: boolean;
  canRejudgeProblem?: boolean;
  canViewProblemSolution?: boolean;
}) {
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();
  const fallbackCanSubmit = useHasPerm(PERM.PERM_SUBMIT_PROBLEM);
  const canSubmit = canSubmitProblem ?? fallbackCanSubmit;
  const hasViewSolutionPerm = useHasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION);
  const hasViewAcceptedSolutionPerm = useHasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT);
  const fallbackCanViewSolution = hasViewSolutionPerm
    || (psdoc?.status === 1 && hasViewAcceptedSolutionPerm);
  const fallbackCanEdit = useHasPerm(PERM.PERM_EDIT_PROBLEM);
  const fallbackCanRejudge = useHasPerm(PERM.PERM_REJUDGE_PROBLEM);
  const canViewSolution = canViewProblemSolution ?? fallbackCanViewSolution;
  const canEdit = canEditProblem ?? fallbackCanEdit;
  const canConfigure = canConfigureProblem ?? (canEdit && !pdoc.reference);
  const canRejudge = canRejudgeProblem ?? fallbackCanRejudge;
  const buildUrl = useBuildUrl();
  const pid = pdoc.pid || pdoc.docId;
  const [rejudgeLoading, setRejudgeLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyOpened, setCopyOpened] = useState(false);
  const [copyError, setCopyError] = useState('');

  const rejudge = async () => {
    if (!window.confirm(t('Confirm rejudge this problem?'))) return;
    setRejudgeLoading(true);
    try {
      await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'rejudge', pid: pdoc.docId }),
      });
    } finally {
      setRejudgeLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloadLoading(true);
    try {
      await downloadProblemZip(pdoc, pdoc.title || String(pid));
    } catch (err: any) {
      window.alert(err?.message || t('Download failed'));
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleCopy = async (target: string) => {
    if (!target) return;
    setCopyLoading(true);
    setCopyError('');
    try {
      const res = await fetch(buildUrl('problem_main'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'copy', pids: [pdoc.docId], target, redirect: true }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCopyError(formatErrorMessage(data.error, t('Copy failed')));
        return;
      }
      if (data.url) window.location.href = data.url;
      else if (data.redirect) window.location.href = data.redirect;
      else window.location.href = buildUrl('problem_main');
    } catch (err: any) {
      setCopyError(err?.message || t('Copy failed'));
    } finally {
      setCopyLoading(false);
    }
  };

  return (
    <Stack gap="md">
      {contestClosed && (
        <Paper withBorder p="md" className="hydro-panel">
          <Text size="sm" fw={700}>{t('Contest Closed')}</Text>
          <Text size="xs" c="dimmed" mt={4}>{t('The contest has ended. You can view the problem, but contest submissions are closed.')}</Text>
        </Paper>
      )}

      {psdoc && psdoc.status !== undefined && (
        <Paper withBorder p="md" className="hydro-panel">
          <Text size="xs" c="dimmed" mb="xs">{t('Your Status')}</Text>
          <RecordStatusBadge status={psdoc.status} />
          {psdoc.score !== undefined && (
            <Text size="sm" mt="xs">
              {t('Score')}: {psdoc.score}
            </Text>
          )}
        </Paper>
      )}

      <Paper withBorder p="md" className="hydro-panel">
        <Stack gap="xs">
          {contestClosed ? (
            <Button disabled fullWidth size="sm" justify="flex-start">
              {t('Contest Closed')}
            </Button>
          ) : canSubmit ? (
            <Button onClick={onToggleScratchpad} variant="filled" fullWidth size="sm" justify="flex-start">
              {scratchpadOpen ? t('Quit Scratchpad') : t('Enter Online Programming Mode')}
            </Button>
          ) : (
            <Button disabled fullWidth size="sm" justify="flex-start">
              {isLoggedIn ? t('No Permission to Submit') : t('Login to Submit')}
            </Button>
          )}

          {canRejudge && (
            <Button onClick={rejudge} variant="subtle" fullWidth size="sm" justify="flex-start" loading={rejudgeLoading}>
              {t('Rejudge all submissions')}
            </Button>
          )}

          {canViewSolution && (
            <SidebarLinkButton href={buildUrl('problem_solution', { pid })}>
              {t('Solutions')}
            </SidebarLinkButton>
          )}

          <SidebarLinkButton href={buildUrl('problem_files', { pid })}>
            {t('Files')}
          </SidebarLinkButton>
          <SidebarLinkButton href={buildUrl('problem_statistics', { pid })}>
            {t('Statistics')}
          </SidebarLinkButton>

          {canEdit && (
            <>
              <SidebarLinkButton href={buildUrl('problem_edit', { pid })}>
                {t('Edit')}
              </SidebarLinkButton>
              {canConfigure && (
                <SidebarLinkButton href={buildUrl('problem_config', { pid })}>
                  {t('Judge Config')}
                </SidebarLinkButton>
              )}
            </>
          )}

          <Button variant="subtle" fullWidth size="sm" justify="flex-start" onClick={handleDownload} loading={downloadLoading}>
            {t('Download')}
          </Button>
          {isLoggedIn && (
            <Button variant="subtle" fullWidth size="sm" justify="flex-start" onClick={() => setCopyOpened(true)} loading={copyLoading}>
              {t('Copy')}
            </Button>
          )}
        </Stack>
      </Paper>

      {rdoc && (
        <Paper withBorder p="md" className="hydro-panel">
          <Text size="xs" c="dimmed" mb="xs">{t('Latest Record')}</Text>
          <Link
            to="record_detail"
            params={{ rid: rdoc._id }}
            className="no-underline"
          >
            <Group gap="xs">
              <RecordStatusBadge status={rdoc.status} size="xs" />
              <TimeDisplay date={rdoc.judgeAt || rdoc._id?.toString()?.substring(0, 8)} format="relative" />
            </Group>
          </Link>
        </Paper>
      )}
      <FormDialog
        opened={copyOpened}
        title={t('Copy Problem')}
        fields={[{
          name: 'target',
          label: t('Target'),
          type: 'domain',
          required: true,
          placeholder: t('Search by domain ID or name'),
        }]}
        onClose={() => {
          setCopyOpened(false);
          setCopyError('');
        }}
        onSubmit={(values) => handleCopy(String(values.target || ''))}
        confirmLabel={t('Copy')}
        cancelLabel={t('Cancel')}
        loading={copyLoading}
        error={copyError}
      />
    </Stack>
  );
}

export default function ProblemDetailPage() {
  const { args } = usePageData();
  const ui = useUiContext();
  const user = useUserContext();
  const { t } = useI18n();
  const sessionLanguage = useSessionStore((s) => s.language);
  const buildUrl = useBuildUrl();

  const pdoc = args.pdoc || {};
  const psdoc = args.psdoc;
  const rdoc = args.rdoc;
  const owner = args.udoc || args.owner_udoc;
  const solutionCount = args.solutionCount;
  const relatedContests = args.ctdocs || [];
  const relatedHomework = args.htdocs || [];
  const langs = useMemo(() => contentLanguages(pdoc.content), [pdoc.content]);
  const [selectedLang, setSelectedLang] = useState(() => {
    const queryLang = new URLSearchParams(window.location.search).get('lang');
    return queryLang || (langs.includes(sessionLanguage) ? sessionLanguage : langs[0] || sessionLanguage);
  });
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ name: string, size: number } | null>(null);
  const pid = pdoc.pid || pdoc.docId;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.file-preview-link');
      if (!target) return;
      e.preventDefault();
      const filename = target.getAttribute('data-file-src');
      if (filename) {
        setPreviewFile({ name: filename, size: 0 });
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const fileUrl = previewFile ? `/p/${pid}/file/${encodeURIComponent(previewFile.name)}?type=additional_file` : '';

  const title = extractLocalizedContent(pdoc.title, selectedLang || sessionLanguage);
  const scratchpadLangs = Object.fromEntries((pdoc.config?.langs || []).map((lang: string) => [lang, { display: getLangDisplay(lang) }]));
  const submitPid = pdoc.docId || pdoc.pid;
  const tid = args.tdoc?.docId || args.tdoc?._id || new URLSearchParams(window.location.search).get('tid') || undefined;
  const fallbackCanSubmit = hasPermValue(user.perm, PERM.PERM_SUBMIT_PROBLEM);
  const accepted = psdoc?.status === 1;
  const contestClosed = Boolean(args.tdoc) && (() => {
    const now = Date.now();
    const endAt = new Date(args.tdoc.endAt).getTime();
    if (Number.isFinite(endAt) && endAt <= now) return true;
    const tsEndAt = args.tsdoc?.endAt ? new Date(args.tsdoc.endAt).getTime() : Number.NaN;
    if (Number.isFinite(tsEndAt) && tsEndAt <= now) return true;
    const startAt = args.tsdoc?.startAt ? new Date(args.tsdoc.startAt).getTime() : Number.NaN;
    if (args.tdoc.duration && Number.isFinite(startAt)) {
      return startAt + Number(args.tdoc.duration) * 60 * 60 * 1000 <= now;
    }
    return false;
  })();
  const canSubmitProblem = Boolean(args.canSubmitProblem ?? (tid ? args.mode === 'contest' : fallbackCanSubmit));
  const canEditProblem = Boolean(args.canEditProblem ?? hasPermValue(user.perm, PERM.PERM_EDIT_PROBLEM));
  const canConfigureProblem = Boolean(args.canConfigureProblem ?? (canEditProblem && !pdoc.reference));
  const canRejudgeProblem = Boolean(args.canRejudgeProblem ?? hasPermValue(user.perm, PERM.PERM_REJUDGE_PROBLEM));
  const canViewProblemSolution = Boolean(args.canViewProblemSolution ?? (!tid && (
    hasPermValue(user.perm, PERM.PERM_VIEW_PROBLEM_SOLUTION)
    || (accepted && hasPermValue(user.perm, PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT))
  )));
  const submitUrl = buildUrl('problem_submit', { pid: submitPid }, tid ? { tid: String(tid) } : {});
  const codeLang = ui.codeLang || user.codeLang;
  const codeTemplate = ui.codeTemplate ?? user.codeTemplate;
  const templateCode = typeof codeTemplate === 'string'
    ? codeTemplate
    : codeTemplate?.[codeLang] || '';
  const defaultCode = rdoc?.code || templateCode;
  const statement = (
    <Stack gap="md">
      {langs.length > 1 && (
        <Group gap="xs" className="border-b border-[var(--hydro-border)] pb-3">
          {langs.map((lang) => (
            <Button
              key={lang}
              size="xs"
              variant={selectedLang === lang ? 'filled' : 'light'}
              onClick={() => {
                setSelectedLang(lang);
                const url = new URL(window.location.href);
                url.searchParams.set('lang', lang);
                window.history.replaceState(null, '', url.pathname + url.search);
              }}
            >
              {langLabel(lang)}
            </Button>
          ))}
        </Group>
      )}
      <MarkdownRenderer content={pdoc.content || ''} language={selectedLang} pid={pid} />
    </Stack>
  );

  if (scratchpadOpen) {
    return (
      <Scratchpad
        pid={pdoc.pid || pdoc.docId}
        langs={scratchpadLangs}
        defaultLang={rdoc?.lang || codeLang}
        defaultCode={defaultCode}
        statement={statement}
        title={`${pdoc.pid || pdoc.docId}. ${title}`}
        submitUrl={submitUrl}
        codeReplaySessionUrl={ui.codeReplaySessionUrl}
        onClose={() => setScratchpadOpen(false)}
      />
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0">
        <Stack gap="lg">
          <Paper withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
            <Group justify="space-between" align="flex-start" gap="md" wrap="wrap" className="border-b border-[var(--hydro-border)] pb-4">
              <div className="min-w-0 flex-1">
                <Group gap="xs" mb="xs">
                  <Button component="a" href="/p" variant="subtle" size="compact-xs" leftSection={<IconArrowLeft size={14} />}>
                    {t('Back')}
                  </Button>
                </Group>
                <Title order={1} className="text-2xl leading-tight text-[var(--hydro-text)]">
                  <span className="text-[var(--hydro-primary)]">{pdoc.pid || pdoc.docId}</span>
                  {' '}
                  {title}
                </Title>
                <Group gap="xs" mt="md">
                  {solutionCount !== undefined && <Badge variant="light">{t('Solutions')}: {solutionCount}</Badge>}
                  {pdoc.hidden && <Badge color="red" variant="light">{t('Hidden')}</Badge>}
                </Group>
                <ProblemTags tags={pdoc.tag} />
              </div>
            </Group>
            <div className="mt-5">
              <ProblemMeta pdoc={pdoc} owner={owner} />
            </div>
          </Paper>

          {(!pdoc.data || pdoc.data.length === 0) && (
            <Paper withBorder p="md" className="border-[var(--hydro-warning)]" style={{ background: 'rgba(233, 161, 0, 0.08)' }}>
              <Text size="sm" fw={700} c="orange">WARNING:</Text>
              <Text size="sm">{t('This problem has no testdata.')}</Text>
            </Paper>
          )}

          <Paper withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
            {statement}
          </Paper>

          {(relatedContests.length > 0 || relatedHomework.length > 0) && (
            <Card withBorder p="lg" className="hydro-content-card">
              <Title order={4} mb="sm">{t('Related')}</Title>
              <Stack gap="xs">
                {relatedContests.map((tdoc: any) => (
                  <Link key={tdoc.docId || tdoc._id} to="contest_detail" params={{ tid: tdoc.docId || tdoc._id }} className="hydro-subtle-link text-sm font-semibold">
                    {tdoc.title}
                  </Link>
                ))}
                {relatedHomework.map((tdoc: any) => (
                  <Link key={tdoc.docId || tdoc._id} to="homework_detail" params={{ tid: tdoc.docId || tdoc._id }} className="hydro-subtle-link text-sm font-semibold">
                    {tdoc.title}
                  </Link>
                ))}
              </Stack>
            </Card>
          )}
        </Stack>
      </div>

      <div className="w-full lg:w-64 shrink-0">
        <ProblemSidebar
          pdoc={pdoc}
          psdoc={psdoc}
          rdoc={rdoc}
          scratchpadOpen={scratchpadOpen}
          contestClosed={contestClosed}
          canSubmitProblem={canSubmitProblem}
          canEditProblem={canEditProblem}
          canConfigureProblem={canConfigureProblem}
          canRejudgeProblem={canRejudgeProblem}
          canViewProblemSolution={canViewProblemSolution}
          onToggleScratchpad={() => setScratchpadOpen((open) => !open)}
        />
      </div>

      <FilePreviewModal
        opened={!!previewFile}
        onClose={() => setPreviewFile(null)}
        file={previewFile}
        fileUrl={fileUrl}
      />
    </div>
  );
}
