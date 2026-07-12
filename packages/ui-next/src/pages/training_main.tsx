import { Badge, Button, Group, Progress, Stack, Text, TextInput, Title } from '@mantine/core';
import {
  IconArrowUpRight, IconBook2, IconChecklist, IconPlus, IconSearch, IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { usePageData, useUserContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, PERM, useHasPerm } from '@/hooks/use-permission';
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

function TrainingCard({ tdoc, tsdoc }: { tdoc: any, tsdoc?: any }) {
  const { t } = useI18n();
  const pids = getTrainingPids(tdoc);
  const sections = getSections(tdoc);
  const progress = trainingProgress(tsdoc, pids.length);
  const enrolled = isTrainingEnrolled(tsdoc);
  const state = getTrainingViewState(tsdoc);

  return (
    <Link
      to="training_detail"
      params={{ tid: tdoc.docId || tdoc._id }}
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

function EnrolledTraining({ tsdoc, tdoc }: { tsdoc: any, tdoc: any }) {
  const progress = trainingProgress(tsdoc, getTrainingPids(tdoc).length);

  return (
    <Link
      to="training_detail"
      params={{ tid: tsdoc.docId || tsdoc._id }}
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
  const [search, setSearch] = useState(q);

  const enrolled = Object.values(tsdict).filter(isTrainingEnrolled);

  const handleSearch = () => {
    const url = new URL(window.location.href);
    if (search) url.searchParams.set('q', search);
    else url.searchParams.delete('q');
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
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

      <div className={`hydro-training-layout${isLoggedIn ? '' : ' hydro-training-layout--single'}`}>
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
                />
              ))}
            </div>
          )}
          <div className="hydro-training-paginator">
            <Paginator page={page} totalPages={tpcount} />
          </div>
        </section>

        {isLoggedIn && (
          <aside className="hydro-training-sidebar">
            <section className="hydro-training-enrolled-panel">
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
                    />
                  ))}
                </Stack>
              ) : (
                <div className="hydro-training-enrolled-empty">
                  <IconBook2 size={22} stroke={1.6} aria-hidden="true" />
                  <Text size="sm" c="dimmed">{t('No training')}</Text>
                </div>
              )}
            </section>
          </aside>
        )}
      </div>
    </main>
  );
}
