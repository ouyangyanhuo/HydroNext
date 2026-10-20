import { Badge, Group, Menu, Stack, Text, Title, Tooltip } from '@mantine/core';
import {
  IconArrowUpRight, IconCheck, IconChevronDown, IconChevronRight, IconClock, IconCode,
  IconLogin2, IconSortAscending, IconSpeakerphone, IconTrophy, IconUserPlus,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { PERM, useHasPerm } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';
import { formatUserName } from '@/utils/user-name';

function SectionLink({ to, label }: { to: string, label: string }) {
  return (
    <Button
      component={Link}
      to={to}
      variant="subtle"
      size="compact-sm"
      rightSection={<IconArrowUpRight size={15} stroke={1.9} />}
      className="hydro-section-link"
    >
      {label}
    </Button>
  );
}

function WelcomeHero({ problemCount, contestCount }: { problemCount: number, contestCount: number }) {
  const user = useSessionStore((s) => s.user);
  const serverName = useSessionStore((s) => s.ui.serverName) || 'HydroNext';
  const registrationEnabled = useSessionStore((s) => s.ui.registrationEnabled !== false);
  const { t } = useI18n();
  const isLoggedIn = user._id > 0;

  const stats = [
    { icon: IconCode, label: t('Problems'), value: problemCount, tone: 'primary' },
    { icon: IconTrophy, label: t('Contests'), value: contestCount, tone: 'accent' },
  ];

  return (
    <section className="hydro-home-hero hydro-reveal" aria-labelledby="hydro-home-title">
      <div className="hydro-home-hero__copy">
        <Title id="hydro-home-title" order={1} className="hydro-home-title">
          {isLoggedIn ? `${t('Welcome')}, ${formatUserName(user)}` : t('Welcome to {0}', serverName)}
        </Title>
        <Text className="hydro-home-lead">
          {isLoggedIn
            ? t('Explore problems, contests, and improve your skills.')
            : t('Sign in to continue to Hydro.')}
        </Text>
        {!isLoggedIn && (
          <Group mt="lg" gap="sm">
            {registrationEnabled && (
              <Button
                component={Link}
                to="user_register"
                size="md"
                variant="filled"
                leftSection={<IconUserPlus size={18} stroke={2} />}
                className="hydro-primary-action"
              >
                {t('Register')}
              </Button>
            )}
            <Button
              component={Link}
              to="user_login"
              size="md"
              variant={registrationEnabled ? 'light' : 'filled'}
              leftSection={<IconLogin2 size={18} stroke={2} />}
              className="hydro-primary-action"
            >
              {t('Login')}
            </Button>
          </Group>
        )}
      </div>
      <div className="hydro-stat-panel" aria-label={t('Statistics')}>
        {stats.map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className={`hydro-stat hydro-stat--${tone}`}>
            <span className="hydro-stat__icon" aria-hidden="true">
              <Icon size={22} stroke={1.8} />
            </span>
            <span className="hydro-stat__value">{value.toLocaleString()}</span>
            <span className="hydro-stat__label">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Bulletin({ bulletin }: { bulletin: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [fullHeight, setFullHeight] = useState<number>(196);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = innerRef.current;
    if (!element) return () => {};
    const update = () => {
      const height = element.scrollHeight;
      setFullHeight(height);
      setIsOverflowing(height > 142);
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(update)
      : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
    };
  }, [bulletin]);

  if (!bulletin) return null;

  return (
    <section className="hydro-bulletin hydro-reveal hydro-reveal--2" aria-labelledby="hydro-bulletin-title">
      <div className="hydro-bulletin__header">
        <div className="hydro-bulletin__title-wrap" id="hydro-bulletin-title">
          <span className="hydro-bulletin__icon" aria-hidden="true">
            <IconSpeakerphone size={16} stroke={2} />
          </span>
          <span className="hydro-bulletin__title">{t('Bulletin')}</span>
        </div>
        {isOverflowing && (
          <Button
            variant="subtle"
            size="sm"
            className="hydro-bulletin__toggle"
            onClick={() => setExpanded(!expanded)}
            rightSection={(
              <IconChevronDown
                size={16}
                stroke={2}
                className={`hydro-bulletin__toggle-icon ${expanded ? 'hydro-bulletin__toggle-icon--expanded' : ''}`}
                aria-hidden="true"
              />
            )}
          >
            {expanded ? t('Show less') : t('Show more')}
          </Button>
        )}
      </div>
      <div className="hydro-bulletin__body">
        <div
          className={`hydro-bulletin__content ${
            isOverflowing ? (expanded ? 'hydro-bulletin__content--expanded' : 'hydro-bulletin__content--clamped') : ''
          }`}
          style={isOverflowing ? { maxHeight: expanded ? `${fullHeight}px` : '196px' } : undefined}
        >
          <div ref={innerRef} className="hydro-bulletin__inner">
            <MarkdownRenderer content={bulletin} />
          </div>
        </div>
      </div>
    </section>
  );
}

type ContestState = 'running' | 'upcoming' | 'finished';

function getContestState(contest: any): ContestState {
  const now = Date.now();
  const beginAt = new Date(contest.beginAt).getTime();
  const endAt = new Date(contest.endAt).getTime();
  if (Number.isFinite(beginAt) && now < beginAt) return 'upcoming';
  if (Number.isFinite(endAt) && now >= endAt) return 'finished';
  return 'running';
}

function ContestStatusBadge({ state }: { state: ContestState }) {
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

function ProblemAcceptance({ submits, accepts }: { submits: number, accepts: number }) {
  if (submits <= 0) {
    return <span className="hydro-data-row__meta">—</span>;
  }
  const rate = Math.min(100, Math.max(0, Math.round((accepts / submits) * 100)));
  const toneClass = rate >= 60 ? 'hydro-acceptance-bar--high' : rate >= 30 ? 'hydro-acceptance-bar--mid' : 'hydro-acceptance-bar--low';

  return (
    <Tooltip label={`${accepts} / ${submits} (${rate}%)`} withArrow withinPortal>
      <div className="hydro-problem-acceptance">
        <div className={`hydro-acceptance-bar ${toneClass}`} aria-hidden="true">
          <div className="hydro-acceptance-bar__fill" style={{ width: `${rate}%` }} />
        </div>
        <span className="hydro-data-row__meta">{rate}%</span>
      </div>
    </Tooltip>
  );
}

function DataPanelEmptyState({
  icon: Icon,
  message,
  tone = 'primary',
  action,
}: {
  icon: typeof IconCode;
  message: string;
  tone?: 'primary' | 'accent';
  action?: { to: string, label: string };
}) {
  return (
    <div className={`hydro-data-panel__empty hydro-data-panel__empty--${tone}`} role="status">
      <span className="hydro-data-panel__empty-icon" aria-hidden="true">
        <Icon size={24} stroke={1.7} />
      </span>
      <Text className="hydro-data-panel__empty-message">{message}</Text>
      {action && (
        <Button
          component={Link}
          to={action.to}
          size="xs"
          variant="light"
          color={tone === 'accent' ? 'orange' : undefined}
          rightSection={<IconChevronRight size={14} />}
          mt={4}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

function SectionSortSelect({
  value,
  onChange,
  data,
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  data: { value: string, label: string }[];
  title: string;
}) {
  return (
    <Menu shadow="md" width="auto" position="bottom-start" offset={6} withinPortal classNames={{ dropdown: 'hydro-topbar-dropdown' }}>
      <Tooltip label={title} withArrow withinPortal openDelay={150} events={{ hover: true, focus: true, touch: false }}>
        <Menu.Target>
          <ActionIcon
            size="sm"
            variant="light"
            aria-label={title}
          >
            <IconSortAscending size={15} />
          </ActionIcon>
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown style={{ minWidth: 200 }}>
        {data.map((item) => (
          <Menu.Item
            key={item.value}
            onClick={() => onChange(item.value)}
            rightSection={item.value === value ? <IconCheck size={14} stroke={2} /> : null}
            fw={item.value === value ? 600 : 400}
            style={item.value === value ? { color: 'var(--hydro-primary)' } : undefined}
          >
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

const PROBLEM_SORTS = ['default', 'recent', 'hot'] as const;
const CONTEST_SORTS = ['default', 'joined', 'hot'] as const;

/** Preferences are independent for each list, domain and signed-in account. */
function useHomepageSort<T extends string>(kind: 'problem' | 'contest', options: readonly T[], enabled: boolean) {
  const uid = useSessionStore((s) => s.user._id);
  const domainId = useSessionStore((s) => s.ui.domainId) || 'system';
  const key = enabled ? `hydro:homepage-sort:v1:${kind}:${uid}:${encodeURIComponent(domainId)}` : null;
  const initial = useMemo(() => {
    try {
      const saved = key ? window.localStorage.getItem(key) : null;
      if (options.includes(saved as T)) return saved as T;
    } catch { /* Storage can be unavailable in restricted browsers. */ }
    return options[0];
  }, [key, options]);
  const [selection, setSelection] = useState(() => ({ key, value: initial }));
  // A scope change must never render the previous account/domain's preference.
  const value = selection.key === key ? selection.value : initial;
  const onChange = (next: string) => {
    if (!key || !options.includes(next as T)) return;
    setSelection({ key, value: next as T });
    try { window.localStorage.setItem(key, next); } catch { /* Keep sorting usable without persistence. */ }
  };
  return [value, onChange] as const;
}

function ProblemList({ problems, psdict = {} }: { problems: any[], psdict?: Record<string, any> }) {
  const { t } = useI18n();
  const language = useSessionStore((s) => s.language);
  const user = useSessionStore((s) => s.user);
  const isLoggedIn = user && user._id > 0;
  const canViewProblem = useHasPerm(PERM.PERM_VIEW_PROBLEM);
  const canSort = isLoggedIn && canViewProblem;

  const [sort, setSort] = useHomepageSort('problem', PROBLEM_SORTS, canSort);

  const cardTitle = sort === 'recent'
    ? t('Recently Attempted Problems')
    : sort === 'hot'
      ? t('Most Attempted Problems')
      : t('Problem List');

  const sortedProblems = useMemo(() => {
    if (sort === 'hot') {
      return [...problems].sort((a, b) => {
        const aSubmits = Number(a.nSubmit) || 0;
        const bSubmits = Number(b.nSubmit) || 0;
        return bSubmits - aSubmits;
      });
    }
    if (sort === 'recent') {
      return [...problems].sort((a, b) => {
        const aId = a.docId || a.pid || a._id;
        const bId = b.docId || b.pid || b._id;
        const aPs = psdict[aId] || psdict[String(aId)] || psdict[a.docId] || psdict[a.pid] || psdict[a._id];
        const bPs = psdict[bId] || psdict[String(bId)] || psdict[b.docId] || psdict[b.pid] || psdict[b._id];

        const aAttempted = Boolean(aPs && (aPs.rid || aPs.status !== undefined || aPs.score !== undefined));
        const bAttempted = Boolean(bPs && (bPs.rid || bPs.status !== undefined || bPs.score !== undefined));

        const aFull = Boolean(aPs && (aPs.status === 1 || (Number.isFinite(aPs.score) && aPs.score >= (a.score || 100))));
        const bFull = Boolean(bPs && (bPs.status === 1 || (Number.isFinite(bPs.score) && bPs.score >= (b.score || 100))));

        const aRank = aAttempted ? (aFull ? 1 : 0) : 2;
        const bRank = bAttempted ? (bFull ? 1 : 0) : 2;

        if (aRank !== bRank) return aRank - bRank;

        if (aAttempted && bAttempted) {
          const aTime = aPs.updatedAt ? new Date(aPs.updatedAt).getTime() : 0;
          const bTime = bPs.updatedAt ? new Date(bPs.updatedAt).getTime() : 0;
          if (bTime !== aTime) return bTime - aTime;
        }
        return 0;
      });
    }
    return problems;
  }, [problems, psdict, sort]);

  const displayProblems = sortedProblems.slice(0, 5);

  return (
    <section className="hydro-data-panel hydro-data-panel--problems hydro-reveal hydro-reveal--3" aria-labelledby="problem-list-title">
      <div className="hydro-data-panel__header">
        <Group gap="xs" align="center">
          <Title id="problem-list-title" order={3}>{cardTitle}</Title>
          {canSort && (
            <SectionSortSelect
              value={sort}
              onChange={setSort}
              title={t('Sort problem list')}
              data={[
                { value: 'default', label: t('Default order') },
                { value: 'recent', label: t('Recently attempted') },
                { value: 'hot', label: t('Most attempted') },
              ]}
            />
          )}
        </Group>
        <SectionLink to="problem_main" label={t('View All')} />
      </div>
      {displayProblems.length > 0 ? (
        <div className="hydro-data-list">
          {displayProblems.map((problem: any) => {
            const id = problem.pid || problem.docId;
            const submits = Number(problem.nSubmit) || 0;
            const accepts = Number(problem.nAccept) || 0;
            return (
              <Link
                key={problem.docId || problem._id}
                to="problem_detail"
                params={{ pid: id, ...(problem.domainId ? { domainId: problem.domainId } : {}) }}
                className="hydro-data-row hydro-problem-row"
              >
                <span className="hydro-data-row__id">{id}</span>
                <span className="hydro-data-row__title">
                  {extractLocalizedContent(problem.title, language)}
                </span>
                <ProblemAcceptance submits={submits} accepts={accepts} />
                <IconChevronRight className="hydro-data-row__arrow" size={17} stroke={1.8} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ) : (
        <DataPanelEmptyState
          icon={IconCode}
          message={t('No problems found')}
        />
      )}
    </section>
  );
}

function RecentContests({ contests, tsdict = {} }: { contests: any[], tsdict?: Record<string, any> }) {
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const isLoggedIn = user && user._id > 0;
  const canViewContest = useHasPerm(PERM.PERM_VIEW_CONTEST);
  const canSort = isLoggedIn && canViewContest;

  const [sort, setSort] = useHomepageSort('contest', CONTEST_SORTS, canSort);

  const cardTitle = sort === 'joined'
    ? t('Contests I Joined')
    : sort === 'hot'
      ? t('Most Attended Contests')
      : t('Recent Contests');

  const sortedContests = useMemo(() => {
    if (sort === 'hot') {
      const getAttendeeCount = (c: any) => {
        if (Number.isFinite(c.attend)) return Number(c.attend);
        if (Number.isFinite(c.nAttendee)) return Number(c.nAttendee);
        if (Number.isFinite(c.nAttendees)) return Number(c.nAttendees);
        if (Array.isArray(c.attendees)) return c.attendees.length;
        return 0;
      };
      return [...contests].sort((a, b) => getAttendeeCount(b) - getAttendeeCount(a));
    }
    if (sort === 'joined') {
      const isJoined = (c: any) => {
        const id = c.docId || c._id;
        const tsdoc = tsdict[id] || tsdict[String(id)] || tsdict[c.docId] || tsdict[c._id];
        // c.attend is the total participant count, not this user's enrollment.
        return Number(tsdoc?.attend) > 0;
      };
      const joinedContests = contests.filter(isJoined);
      const stateRank: Record<ContestState, number> = { running: 0, upcoming: 1, finished: 2 };
      return [...joinedContests].sort((a, b) => {
        const aState = getContestState(a);
        const bState = getContestState(b);
        if (stateRank[aState] !== stateRank[bState]) {
          return stateRank[aState] - stateRank[bState];
        }
        if (aState === 'upcoming') {
          return new Date(a.beginAt).getTime() - new Date(b.beginAt).getTime();
        }
        if (aState === 'running') {
          return new Date(a.endAt).getTime() - new Date(b.endAt).getTime();
        }
        return new Date(b.endAt).getTime() - new Date(a.endAt).getTime();
      });
    }
    return contests;
  }, [contests, tsdict, sort]);

  const displayContests = sortedContests.slice(0, 5);

  return (
    <section className="hydro-data-panel hydro-reveal hydro-reveal--4" aria-labelledby="recent-contests-title">
      <div className="hydro-data-panel__header">
        <Group gap="xs" align="center">
          <Title id="recent-contests-title" order={3}>{cardTitle}</Title>
          {canSort && (
            <SectionSortSelect
              value={sort}
              onChange={setSort}
              title={t('Sort recent contests')}
              data={[
                { value: 'default', label: t('Default order') },
                { value: 'joined', label: t('Contests I joined') },
                { value: 'hot', label: t('Most attended') },
              ]}
            />
          )}
        </Group>
        <SectionLink to="contest_main" label={t('View All')} />
      </div>
      {displayContests.length > 0 ? (
        <div className="hydro-data-list">
          {displayContests.map((contest: any) => {
            const state = getContestState(contest);
            return (
              <Link
                key={contest.docId || contest._id}
                to="contest_detail"
                params={{ tid: contest.docId || contest._id, ...(contest.domainId ? { domainId: contest.domainId } : {}) }}
                className={`hydro-data-row hydro-contest-card-row hydro-contest-card-row--${state}`}
              >
                <div className="hydro-contest-card-row__main">
                  <div className="hydro-contest-card-row__header">
                    <Tooltip label={contest.title} withArrow withinPortal multiline maw="calc(100vw - 32px)">
                      <span className="hydro-contest-card-row__title">
                        {contest.title}
                      </span>
                    </Tooltip>
                    <IconChevronRight className="hydro-data-row__arrow" size={16} stroke={1.8} aria-hidden="true" />
                  </div>
                  <div className="hydro-contest-card-row__footer">
                    <Group gap={6} wrap="nowrap" className="hydro-contest-card-row__badges">
                      <ContestStatusBadge state={state} />
                      {contest.rule ? <Badge size="xs" variant="outline" color="gray">{contest.rule}</Badge> : null}
                    </Group>
                    <span className="hydro-contest-card-row__time">
                      <IconClock size={13} stroke={1.8} aria-hidden="true" />
                      <TimeDisplay date={contest.beginAt} format="relative" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <DataPanelEmptyState
          icon={IconTrophy}
          message={t('No contests found')}
          tone="accent"
        />
      )}
    </section>
  );
}

function numericValue(...values: any[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function sectionKey(key: string) {
  return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function sectionList(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value) && Array.isArray(value[0])) return value[0];
  if (Array.isArray(value)) return value;
  return [];
}

function sectionDict(value: any): Record<string, any> {
  if (Array.isArray(value) && Array.isArray(value[0]) && value[1] && typeof value[1] === 'object') {
    return value[1];
  }
  return {};
}

function collectSections(contents: any[]) {
  const sections: Record<string, any> = {};
  const assign = (key: string, value: any) => {
    sections[key] = value;
    sections[sectionKey(key)] = value;
  };

  for (const column of contents || []) {
    if (Array.isArray(column?.sections)) {
      for (const [key, value] of column.sections) assign(key, value);
    }
    if (column?.columns) {
      for (const col of column.columns) {
        if (Array.isArray(col?.sections)) {
          for (const [key, value] of col.sections) assign(key, value);
        } else {
          Object.entries(col || {}).forEach(([key, value]) => assign(key, value));
        }
      }
    }
  }

  return sections;
}

export default function HomePage() {
  const { args } = usePageData();
  const contents = args.contents || [];
  const domain = args.domain || {};
  const sections = collectSections(contents);
  const rawProblems = sections.recentProblems || sections.recent_problems || sections.problems;
  const rawContests = sections.contests || sections.contest;
  const problems = sectionList(rawProblems);
  const psdict = sectionDict(rawProblems);
  const contests = sectionList(rawContests);
  const tsdict = sectionDict(rawContests);
  const problemCount = numericValue(args.problemCount, domain.problemCount, domain.nProblem, problems.length);
  const contestCount = numericValue(args.contestCount, domain.contestCount, contests.length);

  return (
    <Stack gap="lg" className="hydro-home">
      <WelcomeHero problemCount={problemCount} contestCount={contestCount} />
      {domain.bulletin ? <Bulletin bulletin={domain.bulletin} /> : null}
      <div className="hydro-home-grid">
        <ProblemList problems={problems} psdict={psdict} />
        <RecentContests contests={contests} tsdict={tsdict} />
      </div>
    </Stack>
  );
}
