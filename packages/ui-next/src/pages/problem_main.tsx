import { Badge, Button, Card, Checkbox, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { usePageData, useUserContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
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
        <Badge key={tag} size="xs" variant="light" color="gray">
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

function ProblemSidebar({ categories, query }: { categories: any, query: string }) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const groups = normalizeCategories(categories);
  const randomUrl = buildUrl('problem_random', {}, query ? { q: query } : {});
  const [showPopup, setShowPopup] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <Stack gap="md">
      <Card withBorder p="lg" className="hydro-content-card !overflow-visible">
        <Title order={4} mb="sm">{t('Categories')}</Title>
        {groups.length ? (
          <div className="relative grid grid-cols-2 gap-1 overflow-visible">
            {groups.map(([category, children]) => {
              const hasChildren = children.length > 0;
              return (
                <div
                  key={category}
                  className="relative"
                  onMouseEnter={() => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; } setShowPopup(category); }}
                  onMouseLeave={() => { hoverTimer.current = setTimeout(() => setShowPopup(null), 200); }}
                >
                  <div className="rounded-md border border-transparent px-2 py-1.5 transition-all duration-150 hover:border-[var(--hydro-border)] hover:bg-[var(--hydro-surface)]">
                    <Link
                      href={buildUrl('problem_main', {}, { q: `category:${category}` })}
                      className="hydro-subtle-link block"
                    >
                      <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Text size="sm" fw={700} truncate>{category}</Text>
                        {hasChildren && <Text size="xs" c="dimmed">›</Text>}
                      </Group>
                    </Link>
                  </div>
                  {hasChildren && (
                    <div
                      className={`absolute right-[calc(100%+4px)] top-0 z-30 w-[320px] rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] p-3 shadow-[var(--hydro-shadow-lg)] transition-all duration-200 origin-right ${showPopup === category ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'}`}
                      onMouseEnter={() => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; } }}
                      onMouseLeave={() => { hoverTimer.current = setTimeout(() => setShowPopup(null), 200); }}
                    >
                      <Text size="xs" fw={800} c="dimmed" mb="xs">{category}</Text>
                      <div className="flex flex-wrap gap-1.5 max-h-[60vh] overflow-y-auto">
                        {children.map((tag) => (
                          <Link
                            key={tag}
                            href={buildUrl('problem_main', {}, { q: `category:${tag}` })}
                            className="no-underline"
                          >
                            <Badge variant="light" color="gray">
                              {tag}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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
  const { t } = useI18n();
  const navigate = useNavigate();
  const storeCanCreate = useHasPerm(PERM.PERM_CREATE_PROBLEM);
  const storeCanEdit = useHasPerm(PERM.PERM_EDIT_PROBLEM);
  const canCreate = Boolean(args.canCreateProblem ?? (
    hasPermValue(user.perm, PERM.PERM_CREATE_PROBLEM) || storeCanCreate
  ));
  const canEdit = Boolean(args.canEditProblem ?? (
    hasPermValue(user.perm, PERM.PERM_EDIT_PROBLEM) || storeCanEdit
  ));

  const pdocs = args.pdocs || [];
  const psdict = args.psdict || {};
  const page = args.page || 1;
  const ppcount = args.ppcount || 1;
  const qs = args.qs || '';
  const sort = args.sort || 'default';
  const categories = args.categories || {};

  const [search, setSearch] = useState(qs);
  const [sortValue, setSortValue] = useState(sort);
  const [selected, setSelected] = useState<number[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const allSelected = pdocs.length > 0 && pdocs.every((p: any) => selected.includes(p.docId));

  const toggleSelect = (docId: number, checked: boolean) => {
    setSelected((prev) => checked ? [...prev, docId] : prev.filter((id) => id !== docId));
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelected(checked ? pdocs.map((p: any) => p.docId) : []);
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
    if (sortValue && sortValue !== 'default') url.searchParams.set('sort', sortValue);
    else url.searchParams.delete('sort');
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  const columns = [
    ...(canEdit ? [{
      key: 'select',
      title: '',
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
            to="problem_detail"
            params={{ pid: p.pid || p.docId }}
            className="hydro-subtle-link"
          >
            <Text size="sm" fw={700}>{extractLocalizedContent(p.title, lang)}</Text>
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
        <Badge size="sm" variant="light" color="hydroCopper">
          {estimateDifficulty(p)}
        </Badge>
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={t('Problems')}>
        <Group gap="xs" wrap="wrap">
          {canEdit && selected.length > 0 && (
            <Button size="xs" color="red" variant="light" onClick={() => setDeleteDialogOpen(true)}>
              {t('Delete')} ({selected.length})
            </Button>
          )}
          <TextInput
            placeholder={t('Search problems...')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            size="xs"
            className="w-[190px] sm:w-[260px]"
          />
          <Select
            data={[
              { value: 'default', label: t('sort::default') },
              { value: 'recent', label: t('sort::recent') },
            ]}
            value={sortValue}
            onChange={(v) => setSortValue(v || 'default')}
            size="xs"
            className="w-[130px]"
          />
          <Button size="xs" onClick={handleSearch}>{t('Search')}</Button>
          {canCreate && <Button size="xs" variant="light" component={Link} to="problem_create">{t('Create Problem')}</Button>}
          {canCreate && <Button size="xs" variant="light" component={Link} to="problem_import">{t('Import Problems')}</Button>}
        </Group>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          {canEdit && pdocs.length > 0 && (
            <Group gap="xs" mb="xs">
              <Checkbox
                aria-label={t('Select All')}
                checked={allSelected}
                onChange={(e) => toggleSelectAll(e.currentTarget.checked)}
              />
              <Text size="xs" c="dimmed">{t('Select All')}</Text>
            </Group>
          )}
          <DataTable columns={columns} data={pdocs} emptyMessage={t('No problems found')} />
          <Paginator page={page} totalPages={ppcount} />
        </div>

        <div className="w-full shrink-0 lg:w-72">
          <ProblemSidebar categories={categories} query={search} />
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
