import { Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';

const ALL_FILTER = '__all__';

function durationMinutes(tdoc: any) {
  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  if (tdoc.duration) return Math.round(Number(tdoc.duration) / 60000);
  return Math.max(0, Math.round((endAt - beginAt) / 60000));
}

function ContestCard({ tdoc, tsdoc }: { tdoc: any, tsdoc?: any }) {
  const { t } = useI18n();
  const now = Date.now();
  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  const isRunning = now >= beginAt && now < endAt;
  const isUpcoming = now < beginAt;
  const isFinished = now >= endAt;
  const statusColor = isRunning ? 'var(--hydro-success)' : isUpcoming ? 'var(--hydro-primary)' : 'var(--hydro-border-strong)';

  return (
    <Card withBorder p="lg" className="hydro-card" style={{ borderLeft: `4px solid ${statusColor}` }}>
      <Group justify="space-between" align="flex-start">
        <div className="flex-1 min-w-0">
          <Group gap="xs" mb="xs">
            <Badge size="xs" variant="light" color={isRunning ? 'green' : isUpcoming ? 'blue' : 'gray'}>
              {isRunning ? t('Running') : isUpcoming ? t('Upcoming') : t('Finished')}
            </Badge>
            <Badge size="xs" variant="outline">{tdoc.rule}</Badge>
          </Group>
          <Link
            to="contest_detail"
            params={{ tid: tdoc.docId || tdoc._id }}
            className="hydro-subtle-link"
          >
            <Text fw={700} size="lg" className="truncate">{tdoc.title}</Text>
          </Link>
          <Group gap="md" mt="sm" wrap="wrap">
            <Text size="xs" c="dimmed">
              {t('Start')}: <TimeDisplay date={tdoc.beginAt} format="absolute" size="xs" />
            </Text>
            <Text size="xs" c="dimmed">
              {t('Duration')}: {durationMinutes(tdoc)}min
            </Text>
            <Text size="xs" c="dimmed">
              {t('Partic.')}: {tdoc.attend || 0}
            </Text>
          </Group>
        </div>
        {tsdoc?.attend && (
          <Badge size="xs" color="green">{t('Registered')}</Badge>
        )}
      </Group>
    </Card>
  );
}

function ImportantContest({ tdoc, tsdoc }: { tdoc: any, tsdoc?: any }) {
  const { t } = useI18n();
  const now = Date.now();
  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  const running = now >= beginAt && now < endAt;

  return (
    <Card withBorder p="lg" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
      <Group justify="space-between" align="flex-start" gap="md">
        <div className="min-w-0">
          <Badge color={running ? 'green' : 'blue'} variant="light" mb="sm">
            {running ? t('Live...') : t('Ready (☆▽☆)')}
          </Badge>
          <Link to="contest_detail" params={{ tid: tdoc.docId || tdoc._id }} className="hydro-subtle-link">
            <Title order={2} size="h3" className="truncate">{tdoc.title}</Title>
          </Link>
          <Group gap="md" mt="sm" wrap="wrap">
            <Text size="xs" c="dimmed">{t('Rule')}: {tdoc.rule}</Text>
            <Text size="xs" c="dimmed">{t('Duration')}: {durationMinutes(tdoc)}min</Text>
            <Text size="xs" c="dimmed">{t('Partic.')}: {tdoc.attend || 0}</Text>
          </Group>
        </div>
        <Stack gap="xs" align="flex-end">
          <Button component={Link} to="contest_detail" params={{ tid: tdoc.docId || tdoc._id }} size="xs">
            {t('View Details')}
          </Button>
          <Badge size="xs" color={tsdoc?.attend ? 'green' : 'gray'} variant="light">
            {tsdoc?.attend ? t('Attended') : t('Not Attended')}
          </Badge>
        </Stack>
      </Group>
    </Card>
  );
}

export default function ContestMainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const canCreateContest = useHasPriv(PRIV.PRIV_CREATE_CONTEST) || args.canCreateContest;

  const tdocs = args.tdocs || [];
  const tsdict = args.tsdict || {};
  const page = args.page || 1;
  const tpcount = args.tpcount || 1;
  const q = args.q || '';
  const groups = args.groups || [];
  const rules = args.rules || args.RULES || {};
  const currentGroup = args.group || '';
  const currentRule = args.rule || '';

  const [search, setSearch] = useState(q);
  const [group, setGroup] = useState(currentGroup);
  const [rule, setRule] = useState(currentRule);
  const important = useMemo(() => {
    const now = Date.now();
    return tdocs.filter((tdoc: any) => {
      const beginAt = new Date(tdoc.beginAt).getTime();
      const endAt = new Date(tdoc.endAt).getTime();
      return (now >= beginAt && now < endAt) || now < beginAt;
    }).slice(0, 2);
  }, [tdocs]);
  const ruleOptions = useMemo(() => {
    const fromRules = Object.entries(rules)
      .filter(([, value]: [string, any]) => !value?.hidden)
      .map(([key, value]: [string, any]) => ({
        value: key,
        label: t(value?.TEXT || value?.text || key),
      }));
    if (fromRules.length) return [{ value: ALL_FILTER, label: t('All') }, ...fromRules];
    const fromDocs = Array.from(new Set(tdocs.map((tdoc: any) => tdoc.rule).filter(Boolean)))
      .map((value: any) => ({ value, label: String(value) }));
    return [{ value: ALL_FILTER, label: t('All') }, ...fromDocs];
  }, [rules, t, tdocs]);

  const handleSearch = () => {
    const url = new URL(window.location.href);
    if (search) url.searchParams.set('q', search);
    else url.searchParams.delete('q');
    if (group) url.searchParams.set('group', group);
    else url.searchParams.delete('group');
    if (rule) url.searchParams.set('rule', rule);
    else url.searchParams.delete('rule');
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <Stack gap="lg">
          {important.length > 0 && (
            <SimpleGrid cols={{ base: 1, md: important.length > 1 ? 2 : 1 }} spacing="md">
              {important.map((tdoc: any) => (
                <ImportantContest key={tdoc.docId || tdoc._id} tdoc={tdoc} tsdoc={tsdict[tdoc.docId || tdoc._id]} />
              ))}
            </SimpleGrid>
          )}

          <PageHeader title={currentRule ? t('All {0} Contests').replace('{0}', currentRule) : t('All Contests')}>
            <Group gap="xs" wrap="wrap">
              <TextInput
                placeholder={t('Search contests...')}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                size="xs"
                className="w-[190px] sm:w-[240px]"
              />
              <Select
                data={[{ value: ALL_FILTER, label: t('All') }, ...groups.map((value: string) => ({ value, label: value }))]}
                value={group || ALL_FILTER}
                onChange={(value) => setGroup(value === ALL_FILTER ? '' : value || '')}
                size="xs"
                w={150}
              />
              <Select
                data={ruleOptions}
                value={rule || ALL_FILTER}
                onChange={(value) => setRule(value === ALL_FILTER ? '' : value || '')}
                size="xs"
                w={170}
              />
              <Button size="xs" onClick={handleSearch}>{t('Search')}</Button>
            </Group>
          </PageHeader>

          {tdocs.length === 0 ? (
            <EmptyState message={t('No contests found')} />
          ) : (
            <Stack gap="md">
              {tdocs.map((tdoc: any) => (
                <ContestCard
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

      {canCreateContest && (
        <div className="w-full shrink-0 lg:w-72">
          <Card withBorder p="md" className="hydro-panel">
            <Title order={3} size="h5" mb="sm">{t('Create Contest')}</Title>
            <Button
              component={Link}
              to="contest_create"
              fullWidth
              size="xs"
            >
              {t('Create a contest')}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
