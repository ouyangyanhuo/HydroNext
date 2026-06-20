import { Badge, Button, Card, Group, Progress, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';

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
  if (!tsdoc?.enroll || !total) return 0;
  if (tsdoc.done) return 100;
  return Math.round(((tsdoc.donePids?.length || 0) / total) * 100);
}

function TrainingCard({ tdoc, tsdoc }: { tdoc: any, tsdoc?: any }) {
  const { t } = useI18n();
  const pids = getTrainingPids(tdoc);
  const sections = getSections(tdoc);
  const progress = trainingProgress(tsdoc, pids.length);

  return (
    <Card withBorder p="lg" className="hydro-card">
      <Group align="flex-start" gap="lg" wrap="nowrap">
        <div className="hidden w-20 shrink-0 rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface-tint)] py-3 text-center sm:block">
          <Text fw={900} size="xl">{tdoc.attend || 0}</Text>
          <Text size="xs" c="dimmed" fw={700}>{t('Enrolled')}</Text>
        </div>
        <div className="min-w-0 flex-1">
          <Group gap="xs" mb={6}>
            {tsdoc?.enroll ? (
              <Badge size="xs" color={tsdoc.done ? 'green' : 'blue'} variant="light">
                {tsdoc.done ? t('Completed') : t('In Progress')}
              </Badge>
            ) : (
              <Badge size="xs" color="gray" variant="light">{t('Not Enrolled')}</Badge>
            )}
            <Badge size="xs" variant="outline">{t('{0} sections').replace('{0}', String(sections.length))}</Badge>
            <Badge size="xs" variant="outline">{t('{0} problems').replace('{0}', String(pids.length))}</Badge>
          </Group>
          <Link to="training_detail" params={{ tid: tdoc.docId || tdoc._id }} className="hydro-subtle-link">
            <Text fw={800} size="lg" className="truncate">{tdoc.title}</Text>
          </Link>
          {(tdoc.content || tdoc.description) && (
            <Text size="sm" c="dimmed" mt={6} className="line-clamp-2">
              {tdoc.content || tdoc.description}
            </Text>
          )}
          {tsdoc?.enroll && (
            <Group gap="sm" mt="sm" wrap="nowrap">
              <Progress value={progress} className="min-w-0 flex-1" />
              <Text size="xs" c="dimmed" className="shrink-0">{t('Completed')} {progress}%</Text>
            </Group>
          )}
        </div>
      </Group>
    </Card>
  );
}

export default function TrainingMainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const isLoggedIn = useIsLoggedIn();
  const tdocs = args.tdocs || [];
  const tsdict = args.tsdict || {};
  const tdict = args.tdict || {};
  const page = args.page || 1;
  const tpcount = args.tpcount || 1;
  const q = args.q || '';
  const [search, setSearch] = useState(q);

  const enrolled = Object.values(tsdict).filter((tsdoc: any) => tsdoc?.enroll);

  const handleSearch = () => {
    const url = new URL(window.location.href);
    if (search) url.searchParams.set('q', search);
    else url.searchParams.delete('q');
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <Stack gap="lg">
          <PageHeader title={t('All Training Plans')}>
            <Group gap="xs" wrap="wrap">
              <TextInput
                placeholder={t('Search training...')}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                size="xs"
                className="w-[190px] sm:w-[260px]"
              />
              <Button size="xs" onClick={handleSearch}>{t('Search')}</Button>
            </Group>
          </PageHeader>

          {tdocs.length === 0 ? (
            <EmptyState message={t('Sorry, there are no training plans.')} />
          ) : (
            <Stack gap="md">
              {tdocs.map((tdoc: any) => (
                <TrainingCard
                  key={tdoc.docId || tdoc._id}
                  tdoc={tdoc}
                  tsdoc={tsdict[tdoc.docId || tdoc._id]}
                />
              ))}
            </Stack>
          )}
          <Paginator page={page} totalPages={tpcount} />
        </Stack>
      </div>

      <div className="w-full shrink-0 lg:w-72">
        <Stack gap="md">
          {args.canCreateTraining && (
            <Card withBorder p="md" className="hydro-panel">
              <Title order={3} size="h5" mb="sm">{t('Create Training Plan')}</Title>
              <Button component={Link} to="training_create" fullWidth size="xs">
                {t('New Training Plan')}
              </Button>
            </Card>
          )}

          {isLoggedIn && (
            <Card withBorder p="md" className="hydro-panel">
              <Title order={3} size="h5" mb="sm">{t('Enrolled')}</Title>
              {enrolled.length ? (
                <Stack gap="sm">
                  {enrolled.map((tsdoc: any) => {
                    const tdoc = tdict[tsdoc.docId] || tdict[tsdoc._id] || {};
                    const total = getTrainingPids(tdoc).length;
                    const progress = trainingProgress(tsdoc, total);
                    return (
                      <div key={tsdoc.docId || tsdoc._id}>
                        <Link to="training_detail" params={{ tid: tsdoc.docId || tsdoc._id }} className="block truncate text-sm font-semibold no-underline hover:underline">
                          {tdoc.title || tsdoc.docId}
                        </Link>
                        <Group gap="xs" mt={4} wrap="nowrap">
                          <Progress value={progress} className="min-w-0 flex-1" />
                          <Text size="xs" c="dimmed">{progress}%</Text>
                        </Group>
                      </div>
                    );
                  })}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">{t('No training')}</Text>
              )}
            </Card>
          )}
        </Stack>
      </div>
    </div>
  );
}
