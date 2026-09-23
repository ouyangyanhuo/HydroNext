import { ActionIcon, Badge, Button, Group, Modal, MultiSelect, Progress, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowUpRight, IconBook2, IconChecklist, IconFolder, IconPencil, IconPlus, IconSearch, IconTrash, IconUsers,
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
  const [categoryName, setCategoryName] = useState('');
  const [categoryTids, setCategoryTids] = useState<string[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [deleteCategory, setDeleteCategory] = useState<any>(null);

  const enrolled = Object.values(tsdict).filter(isTrainingEnrolled);
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
    setEditingCategory(item || null);
    setCategoryName(item?.name || '');
    setCategoryTids((item?.tids || []).map(String));
    setCategoryOpened(true);
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
                {categories.map((item: any) => (
                  <Group key={item._id} gap={4} wrap="nowrap">
                    <Button
                      component={Link}
                      href={buildUrl('training_main', {}, { ...(q ? { q } : {}), category: item._id })}
                      variant={category === item._id ? 'light' : 'subtle'}
                      justify="space-between"
                      size="xs"
                      fullWidth
                      rightSection={<Badge size="xs" variant="transparent">{item.tids?.length || 0}</Badge>}
                    >
                      <Text size="xs" truncate>{item.name}</Text>
                    </Button>
                    {canCreateTraining && (
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          aria-label={t('Edit')}
                          title={t('Edit')}
                          onClick={() => openCategoryEditor(item)}
                        >
                          <IconPencil size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          aria-label={t('Delete')}
                          title={t('Delete')}
                          onClick={() => setDeleteCategory(item)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                ))}
              </Stack>
            </section>

            {isLoggedIn && <section className="hydro-training-enrolled-panel">
              <Group justify="space-between" align="center" mb="md">
                <Title order={3} size="h5">{t('Enrolled')}</Title>
                {enrolled.length > 0 && <Badge size="xs" variant="light">{enrolled.length}</Badge>}
              </Group>
              {enrolled.length ? (
                <Stack gap={6}>
                  {enrolled.map((tsdoc: any) => (
                    <EnrolledTraining
                      key={tsdoc.docId || tsdoc._id}
                      tsdoc={tsdoc}
                      tdoc={tdict[tsdoc.docId] || tdict[tsdoc._id] || {}}
                      page={page}
                      query={q}
                      category={category}
                    />
                  ))}
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
