import { Badge, Group, Menu, Modal, Paper, ScrollArea, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconChevronDown, IconChevronLeft, IconCopy, IconDownload, IconEdit, IconFolder, IconSettings } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ProblemPageExtras } from '@/components/common/addon-slots';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { FilePreviewModal } from '@/components/common/file-preview-modal';
import { FormDialog } from '@/components/common/form-dialog';
import { ProblemNavigation } from '@/components/common/problem-navigation';
import { ResponsiveSidebar } from '@/components/common/responsive-sidebar';
import { TimeDisplay } from '@/components/common/time-display';
import { Scratchpad } from '@/components/editor/scratchpad';
import { getProblemSubmitUrl, resolveSubmissionContext } from '@/components/editor/submission-context';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { ObjectiveAnswerForm, ObjectiveMarkdown } from '@/components/problem/objective-answer-form';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { UserAvatar } from '@/components/user/user-avatar';
import { UserLink } from '@/components/user/user-link';
import { usePageData, useSetPageData, useUiContext, useUserContext } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, hasPrivValue, PERM, PRIV, useHasPerm } from '@/hooks/use-permission';
import { useDeadlinePassed } from '@/hooks/use-time';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';
import { extractLocalizedContent } from '@/utils/i18n-content';
import { getLangDisplay } from '@/utils/lang-display';
import { getProblemEditorUrl, getProblemNavigationQuery, getProblemNavigationSource, getSubmissionRecordQuery } from '@/utils/problem-navigation';

interface ProblemViewTransition {
  finished: Promise<void>;
}

type ProblemTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ProblemViewTransition;
};

function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
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

async function downloadProblemZip(pdoc: any, title: string, statements?: any[]) {
  const [{ zipSync, strToU8 }, yaml] = await Promise.all([
    import('fflate'),
    import('js-yaml'),
  ]);
  const root = String(pdoc.docId || pdoc.pid || 'problem');
  const files: Record<string, Uint8Array> = {};
  const manifest = statements?.map((entry) => {
    if (typeof entry.name !== 'string' || safeFilename(entry.name) !== entry.name || /[\\/\0]/.test(entry.name)) {
      throw new Error('Invalid statement filename');
    }
    if (entry.file && !pdoc.additional_file?.some((file: any) => file.name === entry.file)) throw new Error('Statement file not found');
    return { name: entry.name, lang: entry.lang, ...(entry.file ? { file: entry.file } : { source: `problem_${entry.name}` }) };
  });
  files[`${root}/problem.yaml`] = strToU8(yaml.dump({
    pid: pdoc.pid,
    owner: pdoc.owner,
    title: pdoc.title,
    tag: pdoc.tag,
    nSubmit: pdoc.nSubmit,
    nAccept: pdoc.nAccept,
    difficulty: pdoc.difficulty,
    ...(manifest ? { statements: manifest } : {}),
  }));

  const content = parseContentObject(pdoc.content);
  if (statements) {
    for (const entry of statements) {
      if (!entry.file) files[`${root}/problem_${entry.name}`] = strToU8(entry.content || '');
    }
  } else if (content) {
    for (const [lang, value] of Object.entries(content)) {
      files[`${root}/problem_${lang}.md`] = strToU8(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    }
  } else {
    files[`${root}/problem.md`] = strToU8(String(pdoc.content || ''));
  }

  async function addRemoteFiles(type: 'testdata' | 'additional_file', list: any[], dirname: string) {
    if (!list?.length) return;
    const res = await fetch(`${window.location.pathname.split('/p/')[0]}/p/${pdoc.pid || pdoc.docId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ operation: 'get_links', files: list.map((file) => file.name), type }),
    });
    const data = await res.json();
    if (!res.ok || !data.links) throw new Error('Failed to download problem files');
    for (const [filename, url] of Object.entries<string>(data.links)) {
      const fileRes = await fetch(url);
      if (!fileRes.ok) throw new Error('Failed to download problem files');
      files[`${root}/${dirname}/${filename}`] = new Uint8Array(await fileRes.arrayBuffer());
    }
  }

  await addRemoteFiles('testdata', pdoc.data || [], 'testdata');
  await addRemoteFiles('additional_file', pdoc.additional_file || [], 'additional_file');

  const blob = new Blob([new Uint8Array(zipSync(files)).buffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(title || root)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function contentLanguages(content: any) {
  const obj = parseContentObject(content);
  return obj ? Object.keys(obj).filter((key) => obj[key]) : [];
}

function langLabel(lang: string) {
  const labels: Record<string, string> = Object.fromEntries([
    ['zh', '中文'],
    ['zh_CN', '简体中文'],
    ['zh_TW', '繁體中文'],
    ['en', 'English'],
    ['ja', '日本語'],
    ['ko', '한국어'],
  ]);
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
  const primaryItems = [
    { label: 'ID', value: String(pdoc.docId || pdoc.pid || '-') },
    ...(pdoc.config?.type === 'objective' ? [] : [
      { label: t('Time Limit'), value: formatTime(pdoc) },
      { label: t('Memory Limit'), value: formatMemory(pdoc) },
    ]),
    { label: t('Problem Type'), value: t(`problemType::${pdoc.config?.type || 'default'}`) },
  ];
  const stats = [
    { label: t('Tried'), value: String(pdoc.nSubmit ?? '-') },
    { label: t('Accepted'), value: String(pdoc.nAccept ?? '-') },
    { label: t('Difficulty'), value: estimateDifficulty(pdoc) },
  ];

  return (
    <div className="hydro-problem-meta">
      <div className="hydro-problem-meta__primary">
        {primaryItems.map((item) => (
          <div key={item.label} className="hydro-problem-meta__item">
            <Text size="xs" c="dimmed" fw={700}>{item.label}</Text>
            <Text size="sm" fw={800} truncate className="text-[var(--hydro-text)]">{item.value}</Text>
          </div>
        ))}
      </div>
      <div className="hydro-problem-meta__secondary flex-nowrap">
        {stats.map((item) => (
          <Group key={item.label} gap={4} wrap="nowrap" className="shrink-0">
            <Text size="xs" c="dimmed" className="whitespace-nowrap">{item.label}</Text>
            <Text size="xs" fw={750} className="whitespace-nowrap">{item.value}</Text>
          </Group>
        ))}
        {owner && (
          <div className="ml-auto flex min-w-0 shrink items-center gap-1.5">
            <UserAvatar user={owner} size={24} link={false} className="shrink-0" />
            <div className="min-w-0 max-w-[120px] sm:max-w-[180px] md:max-w-[240px]">
              <Text size="xs" c="dimmed" fw={700} truncate className="whitespace-nowrap leading-tight">{t('Uploaded By')}</Text>
              <UserLink user={owner} size="sm" truncate />
            </div>
          </div>
        )}
      </div>
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

function SidebarLinkButton({ href, children, variant = 'subtle' }: {
  href: string;
  children: React.ReactNode;
  variant?: 'filled' | 'light' | 'subtle' | 'default';
}) {
  return (
    <Button component={Link} href={href} variant={variant} fullWidth size="sm" justify="flex-start">
      {children}
    </Button>
  );
}

function ProblemSidebar({
  pdoc, psdoc, rdoc, onToggleScratchpad, scratchpadOpen,
  contestClosed, canSubmitProblem, canEditProblem, canConfigureProblem,
  canRejudgeProblem, canViewProblemSolution, canViewProblemFiles,
  canDownloadProblem, statements,
}: {
  pdoc: any;
  statements?: any[];
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
  canViewProblemFiles?: boolean;
  canDownloadProblem?: boolean;
}) {
  const { t } = useI18n();
  const isMobile = useMediaQuery('(max-width: 63.99em)', false);
  const isLoggedIn = useIsLoggedIn();
  const fallbackCanSubmit = useHasPerm(PERM.PERM_SUBMIT_PROBLEM);
  const canSubmit = canSubmitProblem ?? fallbackCanSubmit;
  const hasViewSolutionPerm = useHasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION);
  const hasViewAcceptedSolutionPerm = useHasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT);
  const fallbackCanViewSolution = hasViewSolutionPerm
    || (psdoc?.status === 1 && hasViewAcceptedSolutionPerm);
  const fallbackCanEdit = useHasPerm(PERM.PERM_EDIT_PROBLEM);
  const fallbackCanRejudge = useHasPerm(PERM.PERM_REJUDGE_PROBLEM);
  const fallbackCanReadProblemData = useHasPerm(PERM.PERM_READ_PROBLEM_DATA);
  const canViewSolution = canViewProblemSolution ?? fallbackCanViewSolution;
  const canEdit = canEditProblem ?? fallbackCanEdit;
  const canConfigure = canConfigureProblem ?? (canEdit && !pdoc.reference);
  const canRejudge = canRejudgeProblem ?? fallbackCanRejudge;
  const canViewFiles = canViewProblemFiles ?? (canEdit || fallbackCanReadProblemData);
  const canDownload = canDownloadProblem ?? canViewFiles;
  const hasMoreActions = Boolean(canViewFiles || canEdit || canConfigure || canDownload || (isLoggedIn && canEdit));
  const buildUrl = useBuildUrl();
  const pid = pdoc.pid || pdoc.docId;
  const [rejudgeLoading, setRejudgeLoading] = useState(false);
  const [rejudgeOpened, setRejudgeOpened] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyOpened, setCopyOpened] = useState(false);
  const [copyError, setCopyError] = useState('');

  const rejudge = async () => {
    setRejudgeLoading(true);
    try {
      const response = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'rejudge', pid: pdoc.docId }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Operation failed')));
      notifications.show({ title: t('Rejudge request submitted'), message: '', color: 'green' });
      setRejudgeOpened(false);
    } catch (error: any) {
      notifications.show({ title: error?.message || t('Operation failed'), message: '', color: 'red' });
    } finally {
      setRejudgeLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloadLoading(true);
    try {
      await downloadProblemZip(pdoc, pdoc.title || String(pid), statements);
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Download failed'), message: '', color: 'red' });
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleCopy = async (target: string) => {
    if (!target || !isLoggedIn || !canEdit) return;
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
        <Paper withBorder p="md" className="hydro-sidebar-panel">
          <Text size="sm" fw={700}>{t('Contest Closed')}</Text>
          <Text size="xs" c="dimmed" mt={4}>{t('The contest has ended. You can view the problem, but contest submissions are closed.')}</Text>
        </Paper>
      )}

      {psdoc && psdoc.status !== undefined && (
        <Paper withBorder p="md" className="hydro-sidebar-panel">
          <Text size="xs" c="dimmed" mb="xs">{t('Your Status')}</Text>
          <RecordStatusBadge status={psdoc.status} />
          {psdoc.score !== undefined && (
            <Text size="sm" mt="xs">
              {t('Score')}: {psdoc.score}
            </Text>
          )}
        </Paper>
      )}

      <section className="hydro-sidebar-panel">
        <Stack gap="xs">
          {pdoc.config?.type === 'objective' ? null : contestClosed ? (
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
            <Button onClick={() => setRejudgeOpened(true)} variant="subtle" fullWidth size="sm" justify="flex-start" loading={rejudgeLoading}>
              {t('Rejudge all submissions')}
            </Button>
          )}

          {canViewSolution && (
            <SidebarLinkButton href={buildUrl('problem_solution', { pid })}>
              {t('Solutions')}
            </SidebarLinkButton>
          )}

          <SidebarLinkButton href={buildUrl('problem_statistics', { pid })}>
            {t('Statistics')}
          </SidebarLinkButton>

          {hasMoreActions && (
            <Menu
              position={isMobile ? 'bottom-start' : 'left-start'}
              offset={8}
              trigger={isMobile ? 'click' : 'hover'}
              openDelay={100}
              closeDelay={150}
              shadow="md"
              withinPortal
              keepMounted
              zIndex={400}
              classNames={{ dropdown: 'hydro-topbar-dropdown' }}
            >
              <Menu.Target>
                <Button
                  variant="subtle"
                  fullWidth
                  size="sm"
                  justify="space-between"
                  rightSection={(
                    isMobile
                      ? <IconChevronDown size={14} className="opacity-60" />
                      : <IconChevronLeft size={14} className="opacity-60" />
                  )}
                >
                  {t('More')}
                </Button>
              </Menu.Target>
              <Menu.Dropdown style={{ minWidth: 160 }}>
                {canViewFiles && (
                  <Menu.Item
                    component={Link}
                    href={buildUrl('problem_files', { pid })}
                    leftSection={<IconFolder size={16} />}
                  >
                    {t('Files')}
                  </Menu.Item>
                )}
                {canEdit && (
                  <Menu.Item
                    component={Link}
                    href={buildUrl('problem_edit', { pid })}
                    leftSection={<IconEdit size={16} />}
                  >
                    {t('Edit')}
                  </Menu.Item>
                )}
                {canConfigure && (
                  <Menu.Item
                    component={Link}
                    href={buildUrl('problem_config', { pid })}
                    leftSection={<IconSettings size={16} />}
                  >
                    {t('Judge Config')}
                  </Menu.Item>
                )}
                {canDownload && (
                  <Menu.Item
                    onClick={handleDownload}
                    disabled={downloadLoading}
                    leftSection={<IconDownload size={16} />}
                  >
                    {t('Download')}
                  </Menu.Item>
                )}
                {isLoggedIn && canEdit && (
                  <Menu.Item
                    onClick={() => setCopyOpened(true)}
                    disabled={copyLoading}
                    leftSection={<IconCopy size={16} />}
                  >
                    {t('Copy')}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </Stack>
      </section>

      <ProblemNavigation />

      {rdoc && (
        <section className="hydro-sidebar-panel">
          <Text size="xs" c="dimmed" mb="xs">{t('Latest Record')}</Text>
          <Link
            href={buildUrl('record_detail', { rid: rdoc._id }, getSubmissionRecordQuery(window.location.search))}
            className="no-underline"
          >
            <Group gap="xs">
              <RecordStatusBadge status={rdoc.status} size="xs" />
              <TimeDisplay date={rdoc.judgeAt || rdoc._id?.toString()?.substring(0, 8)} format="relative" />
            </Group>
          </Link>
        </section>
      )}
      <FormDialog
        opened={copyOpened && isLoggedIn && canEdit}
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
      <ConfirmDialog
        opened={rejudgeOpened}
        onClose={() => setRejudgeOpened(false)}
        onConfirm={rejudge}
        title={t('Rejudge all submissions')}
        message={t('Confirm rejudge this problem?')}
        confirmLabel={t('Rejudge')}
        loading={rejudgeLoading}
      />
    </Stack>
  );
}

export default function ProblemDetailPage() {
  const { args } = usePageData();
  const setPageData = useSetPageData();
  const ui = useUiContext();
  const user = useUserContext();
  const { t } = useI18n();
  const sessionLanguage = useSessionStore((s) => s.language);
  const buildUrl = useBuildUrl();
  const listSearch = new URLSearchParams(window.location.search);
  const problemListQuery = Object.fromEntries(
    ['page', 'q', 'sort']
      .map((key) => [key, listSearch.get(key)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const problemListUrl = getProblemNavigationSource({ contest: args.tdoc, search: window.location.search, buildUrl })?.sourceUrl
    || buildUrl('problem_main', {}, problemListQuery);

  const pdoc = args.pdoc || {};
  const isObjective = pdoc.config?.type === 'objective';
  const [objectiveSidebar, setObjectiveSidebar] = useState<HTMLDivElement | null>(null);
  const StatementRenderer = isObjective ? ObjectiveMarkdown : MarkdownRenderer;
  const psdoc = args.psdoc;
  const rdoc = args.rdoc;
  const owner = args.udoc || args.owner_udoc;
  const solutionCount = args.solutionCount;
  const relatedContests = args.ctdocs || [];
  const relatedHomework = args.htdocs || [];
  const relatedCount = relatedContests.length + relatedHomework.length;
  const relatedContext = `${ui.domainId}/${user._id}/${pdoc.docId}`;
  const [relatedOpenFor, setRelatedOpenFor] = useState<string | null>(null);
  const relatedOpened = relatedOpenFor === relatedContext;
  const renderRelatedLink = (tdoc: any, to: 'contest_detail' | 'homework_detail') => (
    <Link
      key={`${to}/${tdoc.docId || tdoc._id}`}
      to={to}
      params={{ tid: tdoc.docId || tdoc._id }}
      className="hydro-subtle-link text-sm font-semibold break-words"
    >
      {extractLocalizedContent(tdoc.title, sessionLanguage)}
    </Link>
  );
  const renderRelatedModalItem = (tdoc: any, to: 'contest_detail' | 'homework_detail') => (
    <Link
      key={`${to}/${tdoc.docId || tdoc._id}`}
      to={to}
      params={{ tid: tdoc.docId || tdoc._id }}
      className={[
        'w-full px-4 py-2.5 block hydro-subtle-link',
        'border-b border-[var(--hydro-border)] last:border-b-0',
        'hover:bg-[var(--hydro-surface-muted)] transition-colors',
      ].join(' ')}
      onClick={() => setRelatedOpenFor(null)}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm" fw={600} truncate>
          {extractLocalizedContent(tdoc.title, sessionLanguage)}
        </Text>
        {tdoc.rule && to === 'contest_detail' && (
          <Badge size="xs" variant="outline" tt="uppercase" className="shrink-0">
            {tdoc.rule}
          </Badge>
        )}
      </Group>
    </Link>
  );
  const statements = Array.isArray(args.statements) ? args.statements : null;
  const langs = useMemo(() => (statements
    ? [...new Set<string>(statements.map((entry: any) => entry.lang).filter(Boolean))]
    : contentLanguages(pdoc.content)), [statements, pdoc.content]);
  const [selectedLang, setSelectedLang] = useState(() => {
    const queryLang = new URLSearchParams(window.location.search).get('lang');
    return queryLang || (langs.includes(sessionLanguage) ? sessionLanguage : langs[0] || sessionLanguage);
  });
  const activeLang = langs.includes(selectedLang) ? selectedLang : langs.find((lang) => lang.startsWith(selectedLang)) || langs[0] || selectedLang;
  const [scratchpadRequested, setScratchpadOpen] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'code');
  const scratchpadOpen = !isObjective && scratchpadRequested;
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string, size: number } | null>(null);
  const pid = pdoc.pid || pdoc.docId;

  useEffect(() => {
    if (scratchpadOpen) {
      document.documentElement.classList.add('hydro-scratchpad-active');
      document.body.classList.add('hydro-scratchpad-active');
    }
    return () => {
      document.documentElement.classList.remove('hydro-scratchpad-active');
      document.body.classList.remove('hydro-scratchpad-active');
    };
  }, [scratchpadOpen]);

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

  const domainPrefix = window.location.pathname.match(/^(\/d\/[^/]+)/)?.[0] || '';
  const fileUrl = previewFile ? `${domainPrefix}/p/${pid}/file/${encodeURIComponent(previewFile.name)}?type=additional_file` : '';

  const title = extractLocalizedContent(pdoc.title, selectedLang || sessionLanguage);
  const scratchpadLangs = Object.fromEntries((pdoc.config?.langs || []).map((lang: string) => [lang, { display: getLangDisplay(lang) }]));
  const { pid: submitPid, tid } = resolveSubmissionContext({ pdoc, tdoc: args.tdoc }, window.location.search, pid);
  const fallbackCanSubmit = hasPermValue(user.perm, PERM.PERM_SUBMIT_PROBLEM);
  const accepted = psdoc?.status === 1;
  const isAuthenticated = Boolean(user._id && user._id !== 0);
  const contestDeadline = (() => {
    if (!args.tdoc) return undefined;
    const deadlines: number[] = [];
    const endAt = new Date(args.tdoc.endAt).getTime();
    if (Number.isFinite(endAt)) deadlines.push(endAt);
    const tsEndAt = args.tsdoc?.endAt ? new Date(args.tsdoc.endAt).getTime() : Number.NaN;
    if (Number.isFinite(tsEndAt)) deadlines.push(tsEndAt);
    const startAt = args.tsdoc?.startAt ? new Date(args.tsdoc.startAt).getTime() : Number.NaN;
    if (args.tdoc.duration && Number.isFinite(startAt)) {
      deadlines.push(startAt + Number(args.tdoc.duration) * 60 * 60 * 1000);
    }
    return deadlines.length ? Math.min(...deadlines) : undefined;
  })();
  const contestClosed = useDeadlinePassed(contestDeadline);
  const pageExtras = <ProblemPageExtras
    deadline={contestDeadline}
    title={args.tdoc ? extractLocalizedContent(args.tdoc.title, sessionLanguage) : ''}
  />;
  const canSubmitProblem = Boolean(args.canSubmitProblem ?? (tid ? args.mode === 'contest' : fallbackCanSubmit));
  const canCopyStatementCode = scratchpadOpen && isAuthenticated && canSubmitProblem;
  const canEditProblem = Boolean(args.canEditProblem ?? hasPermValue(user.perm, PERM.PERM_EDIT_PROBLEM));
  const canConfigureProblem = Boolean(args.canConfigureProblem ?? (canEditProblem && !pdoc.reference));
  const canRejudgeProblem = Boolean(args.canRejudgeProblem ?? hasPermValue(user.perm, PERM.PERM_REJUDGE_PROBLEM));
  const canViewProblemSolution = isAuthenticated && Boolean(args.canViewProblemSolution ?? (!tid && (
    hasPermValue(user.perm, PERM.PERM_VIEW_PROBLEM_SOLUTION)
    || (accepted && hasPermValue(user.perm, PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT))
  )));
  const ownsProblem = Boolean(isAuthenticated && (
    String(pdoc.owner ?? '') === String(user._id)
    || String(owner?._id ?? '') === String(user._id)
  ));
  const canReadProblemData = isAuthenticated && Boolean(args.canReadProblemData ?? (
    ownsProblem
    || hasPrivValue(user.priv, PRIV.PRIV_READ_PROBLEM_DATA)
    || hasPermValue(user.perm, PERM.PERM_READ_PROBLEM_DATA)
  ));
  const canViewProblemFiles = isAuthenticated && Boolean(args.canViewProblemFiles ?? (canEditProblem || canReadProblemData));
  const canDownloadProblem = isAuthenticated && Boolean(args.canDownloadProblem ?? canReadProblemData);
  const submitQuery = getProblemNavigationQuery(window.location.search, args.tdoc);
  const submitUrl = getProblemSubmitUrl(window.location.pathname, submitQuery)
    || buildUrl('problem_submit', { pid: submitPid }, submitQuery);
  const codeLang = user.codeLang || ui.codeLang;
  // Draft recovery and language-specific/personal templates are resolved in Scratchpad.
  const defaultCode = rdoc?.code || '';
  const switchScratchpad = (open: boolean) => {
    if (open === scratchpadOpen) return;
    const update = () => {
      const url = getProblemEditorUrl(window.location.href, open);
      window.history.pushState({ ...window.history.state, url }, '', url);
      flushSync(() => {
        setPageData((previous) => ({ ...previous, url: window.location.pathname + window.location.search }), true);
        setScratchpadOpen(open);
      });
    };
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      update();
      return;
    }

    const transitionDocument = document as ProblemTransitionDocument;
    if (transitionDocument.startViewTransition) {
      const root = document.documentElement;
      root.classList.add('problem-workspace-transition');
      try {
        const transition = transitionDocument.startViewTransition(update);
        void transition.finished
          .catch(() => undefined)
          .finally(() => root.classList.remove('problem-workspace-transition'));
        return;
      } catch {
        root.classList.remove('problem-workspace-transition');
        // Fall through to the local animation.
      }
    }

    update();
    window.requestAnimationFrame(() => {
      workspaceRef.current?.animate(
        [
          { opacity: 0, transform: 'translateY(12px) scale(0.985)', filter: 'blur(7px)' },
          { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        ],
        { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
      );
    });
  };
  const statement = (
    <Stack gap="md">
      {langs.length > 1 && (
        <Group gap="xs" className="border-b border-[var(--hydro-border)] pb-3">
          {langs.map((lang) => (
            <Button
              key={lang}
              size="xs"
              variant={activeLang === lang ? 'filled' : 'light'}
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
      {statements ? statements.filter((entry: any) => !langs.length || entry.lang === activeLang).map((entry: any) => (
        <StatementRenderer
          key={entry.name}
          content={args.renderedStatements?.[entry.name] ?? (entry.file
            ? `@[${entry.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'file'}](file://${encodeURIComponent(entry.file)})`
            : entry.content || '')}
          language={activeLang}
          pid={pid}
          enableCodeCopy={canCopyStatementCode}
        />
      )) : <StatementRenderer content={pdoc.content || ''} language={activeLang} pid={pid} enableCodeCopy={canCopyStatementCode} />}
    </Stack>
  );

  if (scratchpadOpen) {
    return (
      <div ref={workspaceRef} className="problem-workspace">
        {pageExtras}
        <Scratchpad
          key={`${ui.domainId}/${pdoc.docId}/${tid || ''}`}
          pid={pdoc.pid || pdoc.docId}
          langs={scratchpadLangs}
          defaultLang={codeLang || rdoc?.lang}
          defaultCode={defaultCode}
          statement={statement}
          title={`${pdoc.pid || pdoc.docId}. ${title}`}
          submitUrl={submitUrl}
          submissionDisabled={Boolean(tid) && (contestClosed || !canSubmitProblem)}
          onClose={() => switchScratchpad(false)}
        />
      </div>
    );
  }

  return (
    <div ref={workspaceRef} className="problem-workspace hydro-problem-detail-page flex flex-col lg:flex-row gap-6">
      {pageExtras}
      <div className="flex-1 min-w-0">
        <Stack gap="lg">
          <Paper withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
            <Group justify="space-between" align="flex-start" gap="md" wrap="wrap" className="border-b border-[var(--hydro-border)] pb-4">
              <div className="min-w-0 flex-1">
                <Group gap="xs" mb="xs">
                  <Button component="a" href={problemListUrl} variant="subtle" size="compact-xs" leftSection={<IconArrowLeft size={14} />}>
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

          {canViewProblemFiles && (isObjective ? !pdoc.config?.count : !pdoc.data?.length) && (
            <Paper withBorder p="md" className="border-[var(--hydro-warning)]" style={{ background: 'rgba(233, 161, 0, 0.08)' }}>
              <Text size="sm" fw={700} c="orange">WARNING:</Text>
              <Text size="sm">{t('This problem has no testdata.')}</Text>
            </Paper>
          )}

          <Paper
            withBorder
            p="lg"
            className="hydro-content-card hydro-problem-content-card border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]"
          >
            {isObjective ? (
              <ObjectiveAnswerForm
                key={`${user._id}/${ui.domainId}/${pdoc.docId}/${tid || ''}`}
                pid={submitPid}
                tid={tid}
                submitUrl={submitUrl}
                sidebarTarget={objectiveSidebar}
                disabled={!isAuthenticated || !canSubmitProblem || Boolean(tid && contestClosed)}
                disabledReason={t(!isAuthenticated ? 'Login to Submit' : tid && contestClosed ? 'Contest Closed' : 'No Permission to Submit')}
              >
                {statement}
              </ObjectiveAnswerForm>
            ) : statement}
          </Paper>
        </Stack>
      </div>

      <ResponsiveSidebar
        className={`w-full lg:w-64 shrink-0${isObjective ? ' hydro-objective-sidebar' : ''}`}
        title={t('Problem Actions') || t('Sidebar')}
      >
        <div className="flex flex-col gap-3.5">
          {isObjective && <div ref={setObjectiveSidebar} className="hydro-sidebar-panel" />}
          <ProblemSidebar
            pdoc={pdoc}
            statements={statements || undefined}
            psdoc={psdoc}
            rdoc={rdoc}
            scratchpadOpen={scratchpadOpen}
            contestClosed={contestClosed}
            canSubmitProblem={canSubmitProblem}
            canEditProblem={canEditProblem}
            canConfigureProblem={canConfigureProblem}
            canRejudgeProblem={canRejudgeProblem}
            canViewProblemSolution={canViewProblemSolution}
            canViewProblemFiles={canViewProblemFiles}
            canDownloadProblem={canDownloadProblem}
            onToggleScratchpad={() => switchScratchpad(true)}
          />
          {relatedCount > 0 && (
            <section className="hydro-sidebar-panel">
              <Title order={4} size="h5" mb="sm">{t('Related')}</Title>
              <Stack gap="xs">
                {relatedContests.slice(0, 5).map((tdoc: any) => renderRelatedLink(tdoc, 'contest_detail'))}
                {relatedHomework.slice(0, Math.max(0, 5 - relatedContests.length)).map((tdoc: any) => renderRelatedLink(tdoc, 'homework_detail'))}
                {relatedCount > 5 && (
                  <Button
                    size="xs"
                    variant="light"
                    fullWidth
                    mt={4}
                    aria-haspopup="dialog"
                    aria-expanded={relatedOpened}
                    onClick={() => setRelatedOpenFor(relatedContext)}
                  >
                    {t('Show more')}
                  </Button>
                )}
              </Stack>
            </section>
          )}
        </div>
      </ResponsiveSidebar>

      <Modal opened={relatedOpened} onClose={() => setRelatedOpenFor(null)} title={t('Related')} size="md">
        {relatedOpened && (
          <Stack gap="md">
            <ScrollArea.Autosize mah="60vh" offsetScrollbars>
              <Stack gap="md">
                {relatedContests.length > 0 && (
                  <div>
                    <Text size="xs" fw={700} c="dimmed" mb="xs" tt="uppercase">
                      {t('Contests')} ({relatedContests.length})
                    </Text>
                    <Paper withBorder p={0} className="overflow-hidden">
                      <Stack gap={0}>
                        {relatedContests.map((tdoc: any) => renderRelatedModalItem(tdoc, 'contest_detail'))}
                      </Stack>
                    </Paper>
                  </div>
                )}
                {relatedHomework.length > 0 && (
                  <div>
                    <Text size="xs" fw={700} c="dimmed" mb="xs" tt="uppercase">
                      {t('Homework')} ({relatedHomework.length})
                    </Text>
                    <Paper withBorder p={0} className="overflow-hidden">
                      <Stack gap={0}>
                        {relatedHomework.map((tdoc: any) => renderRelatedModalItem(tdoc, 'homework_detail'))}
                      </Stack>
                    </Paper>
                  </div>
                )}
              </Stack>
            </ScrollArea.Autosize>
            <Group justify="flex-end">
              <Button variant="default" size="xs" onClick={() => setRelatedOpenFor(null)}>
                {t('Close')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <FilePreviewModal
        opened={!!previewFile}
        onClose={() => setPreviewFile(null)}
        file={previewFile}
        fileUrl={fileUrl}
      />
    </div>
  );
}
