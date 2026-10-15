import { Badge, Group, Stack, Text, Title } from '@mantine/core';
import {
  IconArrowUpRight, IconChevronDown, IconChevronRight, IconClock, IconCode,
  IconLogin2, IconSpeakerphone, IconTrophy, IconUserPlus,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
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
          {isLoggedIn ? `${t('Welcome')}, ${formatUserName(user)}` : t('Welcome to HydroNext')}
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
            size="compact-xs"
            className="hydro-bulletin__toggle"
            onClick={() => setExpanded(!expanded)}
            rightSection={(
              <IconChevronDown
                size={13}
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
    <div className="hydro-problem-acceptance" title={`${accepts} / ${submits} (${rate}%)`}>
      <div className={`hydro-acceptance-bar ${toneClass}`} aria-hidden="true">
        <div className="hydro-acceptance-bar__fill" style={{ width: `${rate}%` }} />
      </div>
      <span className="hydro-data-row__meta">{rate}%</span>
    </div>
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

function ProblemList({ problems }: { problems: any[] }) {
  const { t } = useI18n();
  const language = useSessionStore((s) => s.language);

  return (
    <section className="hydro-data-panel hydro-data-panel--problems hydro-reveal hydro-reveal--3" aria-labelledby="problem-list-title">
      <div className="hydro-data-panel__header">
        <Title id="problem-list-title" order={3}>{t('Problem List')}</Title>
        <SectionLink to="problem_main" label={t('View All')} />
      </div>
      {problems.length > 0 ? (
        <div className="hydro-data-list">
          {problems.map((problem: any) => {
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
          action={{ to: 'problem_main', label: t('View All') }}
        />
      )}
    </section>
  );
}

function RecentContests({ contests }: { contests: any[] }) {
  const { t } = useI18n();

  return (
    <section className="hydro-data-panel hydro-reveal hydro-reveal--4" aria-labelledby="recent-contests-title">
      <div className="hydro-data-panel__header">
        <Title id="recent-contests-title" order={3}>{t('Recent Contests')}</Title>
        <SectionLink to="contest_main" label={t('View All')} />
      </div>
      {contests.length > 0 ? (
        <div className="hydro-data-list">
          {contests.map((contest: any) => {
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
                    <span className="hydro-contest-card-row__title" title={contest.title}>
                      {contest.title}
                    </span>
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
          action={{ to: 'contest_main', label: t('View All') }}
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
  const problems = sectionList(
    sections.recentProblems || sections.recent_problems || sections.problems,
  ).slice(0, 5);
  const contests = sectionList(sections.contests || sections.contest);
  const problemCount = numericValue(args.problemCount, domain.problemCount, domain.nProblem, problems.length);
  const contestCount = numericValue(args.contestCount, domain.contestCount, contests.length);

  return (
    <Stack gap="lg" className="hydro-home">
      <WelcomeHero problemCount={problemCount} contestCount={contestCount} />
      {domain.bulletin ? <Bulletin bulletin={domain.bulletin} /> : null}
      <div className="hydro-home-grid">
        <ProblemList problems={problems} />
        <RecentContests contests={contests} />
      </div>
    </Stack>
  );
}
