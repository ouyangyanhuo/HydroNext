import {
  ActionIcon, Badge, Button, Center, Group, Loader, Modal, MultiSelect, Pagination, Progress, SimpleGrid, Stack, Text,
  TextInput, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowUpRight, IconBook2, IconChecklist, IconChevronRight, IconFolder, IconPencil, IconPlus, IconSearch,
  IconTrash, IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { usePageData, useUserContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, PERM, useHasPerm } from '@/hooks/use-permission';
import { formatErrorMessage } from '@/utils/error';
import { getTrainingViewState, isTrainingEnrolled } from '@/utils/training';

function getTrainingPids(tdoc: any) {
  if (Array.isArray(tdoc.pids)) return tdoc.pids;
  if (Array.isArray(tdoc.sections)) return tdoc.sections.flatMap((section: any) => section.pids || []);
  if (Array.isArray(tdoc.dag)) return tdoc.dag.flatMap((node: any) => node.pids || []);
  return [];
}

function getSections(tdoc: any) {
  if (Array.isArray(tdoc.sections)) return tdoc.sections;
  if (Array.isArray(tdoc.dag)) return tdoc.dag;
  return [];
}

function trainingProgress(tsdoc: any, total: number) {
  if (!isTrainingEnrolled(tsdoc) || !total) return 0;
  if (tsdoc.done) return 100;
  return Math.round(((tsdoc.donePids?.length || 0) / total) * 100);
}

function TrainingCard({ tdoc, tsdoc, page, query, category }: { tdoc: any, tsdoc?: any, page: number, query: string, category: string }) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const pids = getTrainingPids(tdoc);
  const sections = getSections(tdoc);
  const progress = trainingProgress(tsdoc, pids.length);
  const enrolled = isTrainingEnrolled(tsdoc);
  const state = getTrainingViewState(tsdoc);

  return (
    <Link
      href={buildUrl('training_detail', { tid: tdoc.docId || tdoc._id }, {
        page: String(page),
        ...(query ? { q: query } : {}),
        ...(category ? { category } : {}),
      })}
      className={`hydro-training-item hydro-training-item--${state}`}
    >
      <div className="hydro-training-item__participants">
        <IconUsers size={18} stroke={1.7} aria-hidden="true" />
        <Text fw={850} size="lg">{tdoc.attend || 0}</Text>
        <Text size="xs" c="dimmed" fw={650}>{t('Enrollees')}</Text>
      </div>

      <div className="hydro-training-item__content">
        <Group gap="xs" mb={7} wrap="wrap">
          {enrolled ? (
            <Badge size="xs" color={tsdoc.done ? 'green' : 'blue'} variant="light">
              {tsdoc.done ? t('Completed') : t('In Progress')}
            </Badge>
          ) : (
            <Badge size="xs" color="gray" variant="light">{t('Not Enrolled')}</Badge>
          )}
        </Group>
        <Text component="h2" className="hydro-training-item__title">{tdoc.title}</Text>
        {(tdoc.content || tdoc.description) && (
          <Text size="sm" c="dimmed" mt={6} className="hydro-training-item__description">
            {tdoc.content || tdoc.description}
          </Text>
        )}

        <div className="hydro-training-item__footer">
          <div className="hydro-training-item__meta">
            <span>
              <IconBook2 size={15} stroke={1.8} aria-hidden="true" />
              {t('{0} sections').replace('{0}', String(sections.length))}
            </span>
            <span>
              <IconChecklist size={15} stroke={1.8} aria-hidden="true" />
              {t('{0} problems').replace('{0}', String(pids.length))}
            </span>
          </div>
          {enrolled && (
            <div className="hydro-training-item__progress">
              <Progress value={progress} size="sm" />
              <Text size="xs" c="dimmed" fw={700}>{progress}%</Text>
            </div>
          )}
        </div>
      </div>

      <IconArrowUpRight className="hydro-training-item__arrow" size={20} stroke={1.8} aria-hidden="true" />
    </Link>
  );
}

function EnrolledTraining({ tsdoc, tdoc, page, query, category }: { tsdoc: any, tdoc: any, page: number, query: string, category: string }) {
  const buildUrl = useBuildUrl();
  const progress = trainingProgress(tsdoc, getTrainingPids(tdoc).length);

  return (
    <Link
      href={buildUrl('training_detail', { tid: tsdoc.docId || tsdoc._id }, {
        page: String(page),
        ...(query ? { q: query } : {}),
        ...(category ? { category } : {}),
      })}
      className={`hydro-training-enrolled-item${tsdoc.done ? ' hydro-training-enrolled-item--completed' : ''}`}
    >
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Text size="sm" fw={700} truncate>{tdoc.title || tsdoc.docId}</Text>
        <Text size="xs" c="dimmed" fw={750}>{progress}%</Text>
      </Group>
      <Progress value={progress} size="sm" mt={8} color={tsdoc.done ? 'green' : undefined} />
    </Link>
  );
}

function TrainingCategoryItem({ item, query, selected, canManage, onEdit, onDelete }: {
  item: any;
  query: string;
  selected: boolean;
  canManage: boolean;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();

  return (
    <Group gap={4} wrap="nowrap">
      <Button
        component={Link}
        href={buildUrl('training_main', {}, { ...(query ? { q: query } : {}), category: item._id })}
        variant={selected ? 'light' : 'subtle'}
        justify="space-between"
        size="xs"
        fullWidth
        rightSection={<Badge size="xs" variant="transparent">{item.tids?.length || 0}</Badge>}
      >
        <Text size="xs" truncate>{item.name}</Text>
      </Button>
      {canManage && (
        <Group gap={2} wrap="nowrap">
          <ActionIcon size="sm" variant="subtle" aria-label={t('Edit')} title={t('Edit')} onClick={() => onEdit(item)}>
            <IconPencil size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="red" aria-label={t('Delete')} title={t('Delete')} onClick={() => onDelete(item)}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
}

export default function TrainingMainPage() {
  const { args } = usePageData();
  const user = useUserContext();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const isLoggedIn = useIsLoggedIn();
  const storeCanCreateTraining = useHasPerm(PERM.PERM_CREATE_TRAINING);
  const canCreateTraining = Boolean(args.canCreateTraining ?? (
    hasPermValue(user.perm, PERM.PERM_CREATE_TRAINING) || storeCanCreateTraining
  ));
  const tdocs = args.tdocs || [];
  const tsdict = args.tsdict || {};
  const tdict = args.tdict || {};
  const page = args.page || 1;
  const tpcount = args.tpcount || 1;
  const q = args.q || '';
  const category = args.category || '';
  const categories = args.categories || [];
  const trainingOptions = (args.trainingOptions || []).map((tdoc: any) => ({
    value: String(tdoc.docId || tdoc._id),
    label: tdoc.title || String(tdoc.docId || tdoc._id),
  }));
  const [search, setSearch] = useState(q);
  const [categoryOpened, setCategoryOpened] = useState(false);
  const [categoryListOpened, setCategoryListOpened] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryName, setCategoryName] = useState('');
  const [categoryTids, setCategoryTids] = useState<string[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [deleteCategory, setDeleteCategory] = useState<any>(null);
  const [enrolledOpened, setEnrolledOpened] = useState(false);
  const [enrolledLoading, setEnrolledLoading] = useState(false);
  const [enrolledPage, setEnrolledPage] = useState(1);
  const [enrolledPageCount, setEnrolledPageCount] = useState(1);
  const [enrolledItems, setEnrolledItems] = useState<{ tsdoc: any, tdoc: any }[]>([]);
  const [enrolledSearch, setEnrolledSearch] = useState('');
  const enrolledCount = Number(args.enrolledCount) || 0;
  const [enrolledTotal, setEnrolledTotal] = useState(enrolledCount);
  const enrolledPreview = (args.enrolledPreview || [])
    .slice(0, 5)
    .map((tsdoc: any) => ({ tsdoc, tdoc: tdict[String(tsdoc.docId)] || {} }));
  const filteredCategories = categories.filter((item: any) => String(item.name || '')
    .toLocaleLowerCase().includes(categorySearch.trim().toLocaleLowerCase()));
  const categoryPageCount = Math.max(1, Math.ceil(filteredCategories.length / 12));
  const visibleCategories = filteredCategories.slice((categoryPage - 1) * 12, categoryPage * 12);

  const hasSidebar = categories.length > 0 || isLoggedIn || canCreateTraining;

  const handleSearch = () => {
    const url = new URL(window.location.href);
    if (search) url.searchParams.set('q', search);
    else url.searchParams.delete('q');
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  const closeCategoryEditor = () => {
    if (categoryLoading) return;
    setCategoryOpened(false);
    setEditingCategory(null);
    setCategoryName('');
    setCategoryTids([]);
  };

  const openCategoryEditor = (item?: any) => {
    setCategoryListOpened(false);
    setEditingCategory(item || null);
    setCategoryName(item?.name || '');
    setCategoryTids((item?.tids || []).map(String));
    setCategoryOpened(true);
  };

  const openCategoryList = () => {
    setCategorySearch('');
    setCategoryPage(1);
    setCategoryListOpened(true);
  };

  const confirmCategoryDelete = (item: any) => {
    setCategoryListOpened(false);
    setDeleteCategory(item);
  };

  const submitCategory = async () => {
    if (!categoryName.trim()) return;
    setCategoryLoading(true);
    try {
      const res = await fetch(buildUrl('training_main'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          operation: 'category',
          id: editingCategory?._id,
          name: categoryName.trim(),
          tids: categoryTids,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Save failed')));
      notifications.show({ title: t('Saved'), message: '', color: 'green' });
      window.location.reload();
    } catch (error: any) {
      notifications.show({ title: error?.message || t('Save failed'), message: '', color: 'red' });
    } finally {
      setCategoryLoading(false);
    }
  };

  const removeCategory = async () => {
    if (!deleteCategory) return;
    setCategoryLoading(true);
    try {
      const res = await fetch(buildUrl('training_main'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete_category', id: deleteCategory._id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Delete failed')));
      window.location.assign(buildUrl('training_main'));
    } catch (error: any) {
      notifications.show({ title: error?.message || t('Delete failed'), message: '', color: 'red' });
    } finally {
      setCategoryLoading(false);
      setDeleteCategory(null);
    }
  };

  const loadEnrolledPage = async (nextPage: number, keyword = enrolledSearch) => {
    setEnrolledLoading(true);
    try {
      const normalizedKeyword = keyword.trim();
      const res = await fetch(buildUrl('training_enrolled', {}, {
        page: String(nextPage),
        ...(normalizedKeyword ? { q: normalizedKeyword } : {}),
      }), {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Load failed')));
      const nextItems = (data.tsdocs || []).map((tsdoc: any) => ({
        tsdoc,
        tdoc: data.tdict?.[String(tsdoc.docId)] || {},
      }));
      setEnrolledItems(nextItems);
      setEnrolledPage(Number(data.page) || nextPage);
      setEnrolledPageCount(Math.max(1, Number(data.pageCount) || 1));
      setEnrolledTotal(Number(data.total) || 0);
    } catch (error: any) {
      notifications.show({ title: error?.message || t('Load failed'), message: '', color: 'red' });
    } finally {
      setEnrolledLoading(false);
    }
  };

  const openEnrolled = () => {
    setEnrolledSearch('');
    setEnrolledTotal(enrolledCount);
    setEnrolledOpened(true);
    void loadEnrolledPage(1, '');
  };

  return (
    <main className="hydro-training-page">
      <PageHeader title={t('All Training Plans')}>
        <div className="hydro-training-header-actions">
          <TextInput
            placeholder={t('Search training...')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            leftSection={<IconSearch size={15} stroke={1.8} />}
            size="xs"
            className="hydro-training-header-actions__search"
          />
          <Button size="xs" onClick={handleSearch}>{t('Search')}</Button>
          {canCreateTraining && (
            <Button
              component={Link}
              to="training_create"
              size="xs"
              leftSection={<IconPlus size={15} stroke={1.9} />}
            >
              {t('New Training Plan')}
            </Button>
          )}
        </div>
      </PageHeader>

      <div className={`hydro-training-layout${hasSidebar ? '' : ' hydro-training-layout--single'}`}>
        <section className="min-w-0">
          {tdocs.length === 0 ? (
            <EmptyState message={t('Sorry, there are no training plans.')} />
          ) : (
            <div className="hydro-training-list">
              {tdocs.map((tdoc: any) => (
                <TrainingCard
                  key={tdoc.docId || tdoc._id}
                  tdoc={tdoc}
                  tsdoc={tsdict[tdoc.docId || tdoc._id]}
                  page={page}
                  query={q}
                  category={category}
                />
              ))}
            </div>
          )}
          <div className="hydro-training-paginator">
            <Paginator page={page} totalPages={tpcount} />
          </div>
        </section>

        {hasSidebar && (
          <aside className="hydro-training-sidebar">
            <section className="hydro-training-enrolled-panel">
              <Group justify="space-between" align="center" mb="md">
                <Group gap="xs"><IconFolder size={18} /><Title order={3} size="h5">{t('Categories')}</Title></Group>
                {canCreateTraining && (
                  <Button size="compact-xs" variant="light" leftSection={<IconPlus size={13} />} onClick={() => openCategoryEditor()}>
                    {t('Create')}
                  </Button>
                )}
              </Group>
              <Stack gap={6} className="hydro-training-category-list">
                <Button
                  component={Link}
                  href={buildUrl('training_main', {}, q ? { q } : {})}
                  variant={!category ? 'light' : 'subtle'}
                  justify="flex-start"
                  size="xs"
                >
                  {t('All Training Plans')}
                </Button>
                {categories.slice(0, 5).map((item: any) => (
                  <TrainingCategoryItem
                    key={item._id}
                    item={item}
                    query={q}
                    selected={category === item._id}
                    canManage={canCreateTraining}
                    onEdit={openCategoryEditor}
                    onDelete={confirmCategoryDelete}
                  />
                ))}
                {categories.length > 5 && (
                  <Button
                    fullWidth
                    variant="subtle"
                    justify="space-between"
                    rightSection={<IconChevronRight size={16} />}
                    onClick={openCategoryList}
                  >
                    {t('View all')}
                  </Button>
                )}
              </Stack>
            </section>

            {isLoggedIn && <section className="hydro-training-enrolled-panel">
              <Group justify="space-between" align="center" mb="md">
                <Title order={3} size="h5">{t('Enrolled')}</Title>
                <Badge size="xs" variant="light">{enrolledCount}</Badge>
              </Group>
              {enrolledCount ? (
                <Stack gap="xs">
                  {enrolledPreview.map(({ tsdoc, tdoc }: { tsdoc: any, tdoc: any }) => (
                    <EnrolledTraining
                      key={tsdoc.docId || tsdoc._id}
                      tsdoc={tsdoc}
                      tdoc={tdoc}
                      page={page}
                      query={q}
                      category={category}
                    />
                  ))}
                  {enrolledCount > 5 && (
                    <Button
                      fullWidth
                      variant="subtle"
                      justify="space-between"
                      rightSection={<IconChevronRight size={16} />}
                      onClick={openEnrolled}
                    >
                      {t('View all')}
                    </Button>
                  )}
                </Stack>
              ) : (
                <div className="hydro-training-enrolled-empty">
                  <IconBook2 size={22} stroke={1.6} aria-hidden="true" />
                  <Text size="sm" c="dimmed">{t('No training')}</Text>
                </div>
              )}
            </section>}
          </aside>
        )}
      </div>

      <Modal
        opened={categoryListOpened}
        onClose={() => setCategoryListOpened(false)}
        title={(
          <Group gap="xs">
            <IconFolder size={19} />
            <Text fw={750}>{t('Categories')}</Text>
            <Badge size="sm" variant="light">{filteredCategories.length}</Badge>
          </Group>
        )}
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            value={categorySearch}
            onChange={(event) => {
              setCategorySearch(event.currentTarget.value);
              setCategoryPage(1);
            }}
            placeholder={t('Search categories...')}
            leftSection={<IconSearch size={15} />}
          />
          {visibleCategories.length ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              {visibleCategories.map((item: any) => (
                <TrainingCategoryItem
                  key={item._id}
                  item={item}
                  query={q}
                  selected={category === item._id}
                  canManage={canCreateTraining}
                  onEdit={openCategoryEditor}
                  onDelete={confirmCategoryDelete}
                />
              ))}
            </SimpleGrid>
          ) : (
            <EmptyState message={t('No categories')} />
          )}
          {categoryPageCount > 1 && (
            <Center>
              <Pagination value={categoryPage} total={categoryPageCount} onChange={setCategoryPage} />
            </Center>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={categoryOpened}
        onClose={closeCategoryEditor}
        title={t(editingCategory ? 'Edit Training Category' : 'Create Training Category')}
        size="md"
        closeOnClickOutside={!categoryLoading}
        closeOnEscape={!categoryLoading}
      >
        <Stack gap="md">
          <TextInput
            label={t('Category Name')}
            value={categoryName}
            onChange={(event) => setCategoryName(event.currentTarget.value)}
            required
            autoFocus
          />
          <MultiSelect
            label={t('Training Plans')}
            description={t('Select all training plans included in this category.')}
            data={trainingOptions}
            value={categoryTids}
            onChange={setCategoryTids}
            searchable
            clearable
            hidePickedOptions
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeCategoryEditor}>{t('Cancel')}</Button>
            <Button onClick={submitCategory} loading={categoryLoading} disabled={!categoryName.trim()}>
              {editingCategory ? t('Save') : t('Create')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={enrolledOpened}
        onClose={() => setEnrolledOpened(false)}
        title={(
          <Group gap="xs">
            <IconBook2 size={19} />
            <Text fw={750}>{t('Enrolled Training Plans')}</Text>
            <Badge size="sm" variant="light">{enrolledTotal}</Badge>
          </Group>
        )}
        size="lg"
      >
        <Stack gap="md">
          <Group gap="sm" wrap="nowrap">
            <TextInput
              value={enrolledSearch}
              onChange={(event) => setEnrolledSearch(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && void loadEnrolledPage(1)}
              placeholder={t('Search training...')}
              leftSection={<IconSearch size={15} />}
              className="flex-1"
            />
            <Button onClick={() => void loadEnrolledPage(1)} loading={enrolledLoading}>{t('Search')}</Button>
          </Group>
          {enrolledLoading ? (
            <Center mih={220}><Loader size="sm" /></Center>
          ) : enrolledItems.length ? (
            <Stack gap="sm">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {enrolledItems.map(({ tsdoc, tdoc }) => (
                  <EnrolledTraining
                    key={tsdoc.docId || tsdoc._id}
                    tsdoc={tsdoc}
                    tdoc={tdoc}
                    page={page}
                    query={q}
                    category={category}
                  />
                ))}
              </SimpleGrid>
              {enrolledPageCount > 1 && (
                <Center mt="sm">
                  <Pagination
                    value={enrolledPage}
                    total={enrolledPageCount}
                    onChange={(nextPage) => void loadEnrolledPage(nextPage)}
                    disabled={enrolledLoading}
                  />
                </Center>
              )}
            </Stack>
          ) : (
            <EmptyState message={t('No training')} />
          )}
        </Stack>
      </Modal>

      <ConfirmDialog
        opened={Boolean(deleteCategory)}
        onClose={() => setDeleteCategory(null)}
        onConfirm={removeCategory}
        title={t('Delete Category')}
        message={t('Confirm to delete this category?')}
        confirmLabel={t('Delete')}
        cancelLabel={t('Cancel')}
        loading={categoryLoading}
      />
    </main>
  );
}
