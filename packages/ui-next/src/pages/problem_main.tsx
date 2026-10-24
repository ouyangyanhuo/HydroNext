import { Badge, Card, Checkbox, Group, HoverCard, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCode, IconCornerDownLeft, IconDownload, IconSearch, IconTrash,
} from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { DataTable } from '@/components/common/data-table';
import { ListSortSelect } from '@/components/common/list-sort-select';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { usePageData, useUiContext, useUserContext } from '@/context/page-data';
import { useNavigate, useRouterState } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, PERM, useHasPerm } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';
import { extractLocalizedContent } from '@/utils/i18n-content';

function ProblemStatusCell({ psdoc }: { psdoc?: any }) {
  if (!psdoc || psdoc.status === undefined) {
    return <Text c="dimmed" size="xs">-</Text>;
  }
  return <RecordStatusBadge status={psdoc.status} size="xs" />;
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

function ProblemTags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <Group gap={4} mt={6}>
      {tags.slice(0, 4).map((tag) => (
        <Badge key={tag} size="xs" variant="light">
          {tag}
        </Badge>
      ))}
      {tags.length > 4 && <Badge size="xs" variant="outline">+{tags.length - 4}</Badge>}
    </Group>
  );
}

function normalizeCategories(categories: any) {
  if (Array.isArray(categories)) {
    return categories.map((item) => {
      if (Array.isArray(item)) return [item[0], Array.isArray(item[1]) ? item[1] : []] as [string, string[]];
      if (typeof item === 'string') return [item, []] as [string, string[]];
      return [String(item?.name || ''), item?.children || item?.items || []] as [string, string[]];
    }).filter(([name]) => name);
  }
  if (categories && typeof categories === 'object') {
    return Object.entries(categories).map(([name, children]) => [
      name,
      Array.isArray(children) ? children : [],
    ] as [string, string[]]);
  }
  return [];
}

function ProblemSidebar({ categories, query, sort }: { categories: any, query: string, sort: string }) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const groups = normalizeCategories(categories);
  const randomUrl = buildUrl('problem_random', {}, query ? { q: query } : {});

  return (
    <Stack gap="md">
      <Card withBorder p="lg" className="hydro-content-card !overflow-visible">
        <Title order={4} mb="sm">{t('Categories')}</Title>
        {groups.length ? (
          <div className="relative grid grid-cols-2 gap-1 overflow-visible">
            {groups.map(([category, children]) => {
              const hasChildren = children.length > 0;
              const categoryItem = (
                <div
                  className={[
                    'rounded-md border border-transparent px-2 py-1.5 transition-all duration-150',
                    'hover:border-[var(--hydro-border)] hover:bg-[var(--hydro-surface)]',
                  ].join(' ')}
                >
                  <Link
                    href={buildUrl('problem_main', {}, { q: `category:${category}`, sort })}
                    className="hydro-subtle-link block"
                  >
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                      <Text size="sm" fw={700} truncate>{category}</Text>
                      {hasChildren && <Text size="xs" c="dimmed">›</Text>}
                    </Group>
                  </Link>
                </div>
              );

              if (!hasChildren) return <div key={category}>{categoryItem}</div>;

              return (
                <HoverCard
                  key={category}
                  width={320}
                  position="left-start"
                  offset={8}
                  openDelay={120}
                  closeDelay={180}
                  shadow="lg"
                  radius="md"
                  withinPortal
                  zIndex={1200}
                  middlewares={{ flip: true, shift: true }}
                >
                  <HoverCard.Target>
                    <div>{categoryItem}</div>
                  </HoverCard.Target>
                  <HoverCard.Dropdown className="hydro-category-flyout" p="md">
                    <Text size="xs" fw={800} c="dimmed" mb="xs">{category}</Text>
                    <div className="flex max-h-[60vh] flex-wrap gap-1.5 overflow-y-auto">
                      {children.map((tag) => (
                        <Link
                          key={tag}
                          href={buildUrl('problem_main', {}, { q: `category:${tag}`, sort })}
                          className="no-underline"
                        >
                          <Badge variant="light">{tag}</Badge>
                        </Link>
                      ))}
                    </div>
                  </HoverCard.Dropdown>
                </HoverCard>
              );
            })}
          </div>
        ) : (
          <Text c="dimmed" size="sm">{t('No categories')}</Text>
        )}
      </Card>

      <Card withBorder p="lg" className="hydro-content-card">
        <Title order={4} mb="xs">{t('Lucky')}</Title>
        <Text c="dimmed" size="sm" mb="md">
          {t('Pick a problem randomly based on the current filter.')}
        </Text>
        <Button component="a" href={randomUrl} fullWidth variant="light">
          {t('Random Problem')}
        </Button>
      </Card>
    </Stack>
  );
}

export default function ProblemMainPage() {
  const { args } = usePageData();
  const user = useUserContext();
  const { domainId } = useUiContext();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const { loading: routeLoading } = useRouterState();
  const storeCanCreate = useHasPerm(PERM.PERM_CREATE_PROBLEM);
  const storeCanEdit = useHasPerm(PERM.PERM_EDIT_PROBLEM);
  const canCreate = Boolean(args.canCreateProblem ?? (
    hasPermValue(user.perm, PERM.PERM_CREATE_PROBLEM) || storeCanCreate
  ));
  const canEdit = Boolean(args.canEditProblem ?? (
    hasPermValue(user.perm, PERM.PERM_EDIT_PROBLEM) || storeCanEdit
  ));
  const canSelect = canCreate || canEdit;

  const pdocs = args.pdocs || [];
  const psdict = args.psdict || {};
  const page = args.page || 1;
  const ppcount = args.ppcount || 1;
  const qs = args.qs || '';
  const sort = args.sort || 'default';
  const categories = args.categories || {};
  const listKey = `${page}:${qs}:${sort}:${pdocs[0]?.docId || 'empty'}`;

  const [search, setSearch] = useState(qs);
  const selectionScope = JSON.stringify([domainId, user._id, page, qs, sort, pdocs.map((p: any) => p.docId)]);
  const [selection, setSelection] = useState<{ scope: string, ids: number[] }>({ scope: selectionScope, ids: [] });
  const selected = selection.scope === selectionScope ? selection.ids : [];
  const setSelected = (next: number[] | ((prev: number[]) => number[])) => setSelection((prev) => ({
    scope: selectionScope,
    ids: typeof next === 'function' ? next(prev.scope === selectionScope ? prev.ids : []) : next,
  }));
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadPending = useRef(false);

  const allSelected = pdocs.length > 0 && pdocs.every((p: any) => selected.includes(p.docId));

  const toggleSelect = (docId: number, checked: boolean) => {
    setSelected((prev) => checked ? [...new Set([...prev, docId])] : prev.filter((id) => id !== docId));
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelected(checked ? pdocs.map((p: any) => p.docId) : []);
  };

  const handleDownload = async () => {
    if (!canCreate || !selected.length || downloadPending.current) return;
    downloadPending.current = true;
    setDownloading(true);
    try {
      const res = await fetch(buildUrl('problem_main'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/zip, application/json' },
        body: JSON.stringify({ operation: 'download', pids: selected }),
      });
      if (!res.ok || !res.headers.get('content-type')?.includes('application/zip')) {
        const data = res.headers.get('content-type')?.includes('json') ? await res.json() : {};
        throw new Error(formatErrorMessage(data.error, t('Download failed')));
      }
      const objectUrl = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `problems-${domainId}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error: any) {
      notifications.show({ title: t('Download failed'), message: error?.message || t('Network error'), color: 'red' });
    } finally {
      downloadPending.current = false;
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!selected.length) return;
    setDeleting(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete', pids: selected }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Delete failed')), message: '', color: 'red' });
      } else {
        notifications.show({ title: t('Deleted'), message: '', color: 'green' });
        setSelected([]);
        window.location.reload();
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleSearch = () => {
    const url = new URL(window.location.href);
    if (search) {
      url.searchParams.set('q', search);
    } else {
      url.searchParams.delete('q');
    }
    url.searchParams.set('sort', sort);
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  const columns = [
    ...(canSelect ? [{
      key: 'select',
      title: (
        <Tooltip label={t('Select All')} withArrow>
          <Checkbox
            aria-label={t('Select All')}
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            onChange={(e) => toggleSelectAll(e.currentTarget.checked)}
          />
        </Tooltip>
      ),
      width: 40,
      render: (p: any) => (
        <Checkbox
          aria-label={String(p.docId)}
          checked={selected.includes(p.docId)}
          onChange={(e) => toggleSelect(p.docId, e.currentTarget.checked)}
        />
      ),
    }] : []),
    {
      key: 'status',
      title: '',
      width: 40,
      render: (p: any) => <ProblemStatusCell psdoc={psdict[p.docId]} />,
    },
    {
      key: 'pid',
      title: '#',
      width: 80,
      render: (p: any) => (
        <Text size="sm" fw={700} c="dimmed">{p.pid || p.docId}</Text>
      ),
    },
    {
      key: 'title',
      title: t('Title'),
      render: (p: any) => {
        const lang = useSessionStore.getState().language;
        return (
          <Link
            href={buildUrl('problem_detail', { pid: p.pid || p.docId }, {
              page: String(page),
              ...(qs ? { q: qs } : {}),
              sort,
              nav: 'list',
            })}
            className="hydro-subtle-link"
          >
            <Group gap="xs" wrap="wrap">
              <Text size="sm" fw={700}>{extractLocalizedContent(p.title, lang)}</Text>
              {p.hidden && <Badge size="xs" color="red" variant="light">{t('Hidden')}</Badge>}
            </Group>
            <ProblemTags tags={p.tag} />
          </Link>
        );
      },
    },
    {
      key: 'acTried',
      title: `${t('AC')} / ${t('Tried')}`,
      width: 120,
      align: 'center' as const,
      render: (p: any) => (
        <Text size="xs" fw={700}>
          {p.nAccept || 0} / <span className="text-[var(--hydro-text-muted)]">{p.nSubmit || 0}</span>
        </Text>
      ),
    },
    {
      key: 'difficulty',
      title: t('Difficulty'),
      width: 100,
      align: 'center' as const,
      render: (p: any) => (
        <Badge size="sm" variant="light">
          {estimateDifficulty(p)}
        </Badge>
      ),
    },
  ];

  return (
    <Stack gap="lg" className="hydro-problem-page">
      <PageHeader
        title={t('Problems')}
        icon={<IconCode size={22} stroke={2} />}
      >
        <Group gap="xs" wrap="wrap" className="hydro-problem-toolbar">
          {canCreate && selected.length > 0 && (
            <Tooltip label={`${t('Download Selected')} (${selected.length})`} withArrow>
              <ActionIcon
                size={30}
                variant="light"
                loading={downloading}
                disabled={routeLoading || deleting}
                aria-label={t('Download Selected')}
                onClick={() => void handleDownload()}
              >
                <IconDownload size={16} stroke={1.8} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          )}
          {canEdit && selected.length > 0 && (
            <Tooltip label={`${t('Delete')} (${selected.length})`} withArrow>
              <ActionIcon
                size={30}
                color="red"
                variant="light"
                loading={deleting}
                disabled={routeLoading || downloading}
                aria-label={t('Delete')}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <IconTrash size={16} stroke={1.8} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          )}
          <TextInput
            placeholder={t('Search problems...')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            leftSection={<IconSearch size={15} stroke={1.8} />}
            rightSection={(
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => handleSearch()}
                aria-label={t('Search')}
                title={t('Search')}
              >
                <IconCornerDownLeft size={13} stroke={1.8} />
              </ActionIcon>
            )}
            rightSectionPointerEvents="auto"
            size="xs"
            className="w-[190px] sm:w-[260px]"
          />
          <ListSortSelect kind="problem" />
          {canCreate && <Button size="xs" variant="light" component={Link} to="problem_create">{t('Create Problem')}</Button>}
          {canCreate && <Button size="xs" variant="light" component={Link} to="problem_import">{t('Import Problems')}</Button>}
        </Group>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div
            key={listKey}
            className={`hydro-problem-list ${routeLoading ? 'hydro-problem-list--loading' : ''}`}
            aria-busy={routeLoading}
          >
            <DataTable columns={columns} data={pdocs} keyField="docId" emptyMessage={t('No problems found')} />
            <Paginator page={page} totalPages={ppcount} />
          </div>
        </div>

        <div className="w-full shrink-0 lg:w-72">
          <ProblemSidebar categories={categories} query={search} sort={sort} />
        </div>
      </div>

      <ConfirmDialog
        opened={deleteDialogOpen}
        title={t('Confirm delete?')}
        message={t('Confirm to delete this problem?').replace('this', `${selected.length}`)}
        confirmLabel={t('Delete')}
        cancelLabel={t('Cancel')}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteDialogOpen(false)}
      />
    </Stack>
  );
}
