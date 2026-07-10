import { Badge, Button, Group, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import {
  IconArrowUpRight, IconCalendarEvent, IconClock, IconPlus, IconSearch, IconUsers,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { usePageData, useUserContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, PERM, useHasPerm } from '@/hooks/use-permission';

const ALL_FILTER = '__all__';

type ContestState = 'running' | 'upcoming' | 'finished';

function durationMinutes(tdoc: any) {
  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  if (tdoc.duration) return Math.round(Number(tdoc.duration) / 60000);
  return Math.max(0, Math.round((endAt - beginAt) / 60000));
}

function getContestState(tdoc: any): ContestState {
  const now = Date.now();
  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  if (now < beginAt) return 'upcoming';
  if (now >= endAt) return 'finished';
  return 'running';
}

function sortContestsByPriority(tdocs: any[], now: number) {
  return tdocs
    .map((tdoc, index) => {
      const beginAt = new Date(tdoc.beginAt).getTime();
      const endAt = new Date(tdoc.endAt).getTime();
      const started = Number.isFinite(beginAt) && beginAt <= now;
      const distance = started
        ? (Number.isFinite(endAt) ? Math.abs(endAt - now) : Number.POSITIVE_INFINITY)
        : (Number.isFinite(beginAt) ? beginAt - now : Number.POSITIVE_INFINITY);
      return { tdoc, index, started, distance };
    })
    .sort((a, b) => {
      if (a.started !== b.started) return a.started ? -1 : 1;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.index - b.index;
    })
    .map(({ tdoc }) => tdoc);
}

function ContestStatus({ state }: { state: ContestState }) {
  const { t } = useI18n();
  const color = state === 'running' ? 'green' : state === 'upcoming' ? 'blue' : 'gray';
  const label = state === 'running' ? t('Running') : state === 'upcoming' ? t('Upcoming') : t('Finished');

  return (
    <Badge size="xs" variant="light" color={color} className="hydro-contest-status">
      <span className="hydro-contest-status__dot" aria-hidden="true" />
      {label}
    </Badge>
  );
}

function ContestMeta({ tdoc, featured = false }: { tdoc: any, featured?: boolean }) {
  const { t } = useI18n();

  return (
    <div className={featured ? 'hydro-contest-meta hydro-contest-meta--featured' : 'hydro-contest-meta'}>
      <span>
        <IconCalendarEvent size={15} stroke={1.8} aria-hidden="true" />
        <span>{t('Start')}: <TimeDisplay date={tdoc.beginAt} format="absolute" size="xs" /></span>
      </span>
      <span>
        <IconClock size={15} stroke={1.8} aria-hidden="true" />
        <span>{durationMinutes(tdoc)} min</span>
      </span>
      <span>
        <IconUsers size={15} stroke={1.8} aria-hidden="true" />
        <span>{tdoc.attend || 0} {t('Partic.')}</span>
      </span>
    </div>
  );
}

function ContestCard({ tdoc, tsdoc }: { tdoc: any, tsdoc?: any }) {
  const { t } = useI18n();
  const state = getContestState(tdoc);
  const tid = tdoc.docId || tdoc._id;

  return (
    <Link
      to="contest_detail"
      params={{ tid }}
      className={`hydro-contest-item hydro-contest-item--${state}`}
    >
      <span className="hydro-contest-item__rail" aria-hidden="true" />
      <div className="hydro-contest-item__content">
        <Group gap="xs" mb={7} wrap="wrap">
          <ContestStatus state={state} />
          {tdoc.rule && <Badge size="xs" variant="outline">{tdoc.rule}</Badge>}
          {tsdoc?.attend && <Badge size="xs" variant="light" color="green">{t('Registered')}</Badge>}
        </Group>
        <Text component="h2" fw={720} className="hydro-contest-item__title">{tdoc.title}</Text>
        <ContestMeta tdoc={tdoc} />
      </div>
      <IconArrowUpRight className="hydro-contest-item__arrow" size={20} stroke={1.8} aria-hidden="true" />
    </Link>
  );
}

function ImportantContest({ tdoc, tsdoc }: { tdoc: any, tsdoc?: any }) {
  const { t } = useI18n();
  const state = getContestState(tdoc);
  const tid = tdoc.docId || tdoc._id;

  return (
    <article className={`hydro-contest-feature hydro-contest-feature--${state}`}>
      <div className="hydro-contest-feature__topline" aria-hidden="true" />
      <Group justify="space-between" align="center" gap="sm" mb="md" wrap="wrap">
        <ContestStatus state={state} />
        <Group gap={6}>
          {tdoc.rule && <Badge size="xs" variant="outline">{tdoc.rule}</Badge>}
          {tsdoc?.attend && <Badge size="xs" color="green" variant="light">{t('Attended')}</Badge>}
        </Group>
      </Group>
      <Link to="contest_detail" params={{ tid }} className="hydro-subtle-link">
        <Title order={2} size="h3" className="hydro-contest-feature__title">{tdoc.title}</Title>
      </Link>
      <ContestMeta tdoc={tdoc} featured />
      <Button
        component={Link}
        to="contest_detail"
        params={{ tid }}
        variant="light"
        size="xs"
        mt="lg"
        rightSection={<IconArrowUpRight size={15} stroke={1.9} />}
        className="hydro-contest-feature__action"
      >
        {t('View Details')}
      </Button>
    </article>
  );
}

export default function ContestMainPage() {
  const { args } = usePageData();
  const user = useUserContext();
  const { t } = useI18n();
  const navigate = useNavigate();
  const storeCanCreateContest = useHasPerm(PERM.PERM_CREATE_CONTEST);
  const canCreateContest = Boolean(args.canCreateContest ?? (
    hasPermValue(user.perm, PERM.PERM_CREATE_CONTEST) || storeCanCreateContest
  ));

  const tdocs = useMemo(() => args.tdocs || [], [args.tdocs]);
  const tsdict = args.tsdict || {};
  const page = args.page || 1;
  const tpcount = args.tpcount || 1;
  const q = args.q || '';
  const groups = args.groups || [];
  const rules = useMemo(() => args.rules || args.RULES || {}, [args.RULES, args.rules]);
  const currentGroup = args.group || '';
  const currentRule = args.rule || '';

  const [search, setSearch] = useState(q);
  const [group, setGroup] = useState(currentGroup);
  const [rule, setRule] = useState(currentRule);
  const [sortReferenceTime] = useState(() => Date.now());
  const sortedTdocs = useMemo(() => sortContestsByPriority(tdocs, sortReferenceTime), [sortReferenceTime, tdocs]);
  const important = useMemo(
    () => sortedTdocs.filter((tdoc: any) => getContestState(tdoc) !== 'finished').slice(0, 2),
    [sortedTdocs],
  );
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
  const listKey = `${page}:${q}:${currentGroup}:${currentRule}:${sortedTdocs[0]?.docId || 'empty'}`;

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
    <main className="hydro-contest-page">
      <header className="hydro-contest-page-header">
        <div className="hydro-contest-page-header__heading">
          <Title order={2}>
            {currentRule ? t('All {0} Contests').replace('{0}', currentRule) : t('All Contests')}
          </Title>
          <div className="hydro-contest-page-header__accent" aria-hidden="true" />
        </div>
        <div className="hydro-contest-header-actions" aria-label={t('Search')}>
          <TextInput
            placeholder={t('Search contests...')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            leftSection={<IconSearch size={15} stroke={1.8} />}
            size="xs"
            className="hydro-contest-header-actions__search"
          />
          <Select
            data={[{ value: ALL_FILTER, label: t('All') }, ...groups.map((value: string) => ({ value, label: value }))]}
            value={group || ALL_FILTER}
            onChange={(value) => setGroup(value === ALL_FILTER ? '' : value || '')}
            size="xs"
            className="hydro-contest-header-actions__select"
          />
          <Select
            data={ruleOptions}
            value={rule || ALL_FILTER}
            onChange={(value) => setRule(value === ALL_FILTER ? '' : value || '')}
            size="xs"
            className="hydro-contest-header-actions__select hydro-contest-header-actions__select--rule"
          />
          <Button size="xs" onClick={handleSearch} leftSection={<IconSearch size={14} stroke={1.8} />}>
            {t('Search')}
          </Button>
          {canCreateContest && (
            <Button
              component={Link}
              to="contest_create"
              size="xs"
              leftSection={<IconPlus size={15} stroke={1.9} />}
            >
              {t('Create Contest')}
            </Button>
          )}
        </div>
      </header>

      <Stack gap="xl">
        {important.length > 0 && (
          <SimpleGrid cols={{ base: 1, md: important.length > 1 ? 2 : 1 }} spacing="md" className="hydro-contest-feature-grid">
            {important.map((tdoc: any) => (
              <ImportantContest key={tdoc.docId || tdoc._id} tdoc={tdoc} tsdoc={tsdict[tdoc.docId || tdoc._id]} />
            ))}
          </SimpleGrid>
        )}

        {sortedTdocs.length === 0 ? (
          <EmptyState message={t('No contests found')} />
        ) : (
          <div key={listKey} className="hydro-contest-list">
            {sortedTdocs.map((tdoc: any) => (
              <ContestCard
                key={tdoc.docId || tdoc._id}
                tdoc={tdoc}
                tsdoc={tsdict[tdoc.docId || tdoc._id]}
              />
            ))}
          </div>
        )}

        <Paginator page={page} totalPages={tpcount} />
      </Stack>
    </main>
  );
}
