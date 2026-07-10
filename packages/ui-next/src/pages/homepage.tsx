import { Badge, Button, Group, Stack, Text, Title } from '@mantine/core';
import {
  IconArrowUpRight, IconChevronRight, IconCode, IconLogin2, IconTrophy, IconUserPlus,
} from '@tabler/icons-react';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

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
          {isLoggedIn ? `${t('Welcome')}, ${user.uname}` : t('Welcome to HNTOU OJ')}
        </Title>
        <Text className="hydro-home-lead">
          {isLoggedIn
            ? t('Explore problems, contests, and improve your skills.')
            : t('Login or register to start solving problems.')}
        </Text>
        {!isLoggedIn && (
          <Group mt="lg" gap="sm">
            <Button
              component={Link}
              to="user_login"
              size="md"
              leftSection={<IconLogin2 size={18} stroke={2} />}
              className="hydro-primary-action"
            >
              {t('Login')}
            </Button>
            <Button
              component={Link}
              to="user_register"
              size="md"
              variant="default"
              leftSection={<IconUserPlus size={18} stroke={2} />}
              className="hydro-secondary-action"
            >
              {t('Register')}
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

  if (!bulletin) return null;

  return (
    <section className="hydro-bulletin hydro-reveal hydro-reveal--2">
      <span className="hydro-bulletin__label">{t('Bulletin')}</span>
      <div className="hydro-bulletin__content">
        <MarkdownRenderer content={bulletin} />
      </div>
    </section>
  );
}

function DataPanelEmptyState({
  icon: Icon,
  message,
  tone = 'primary',
}: {
  icon: typeof IconCode;
  message: string;
  tone?: 'primary' | 'accent';
}) {
  return (
    <div className={`hydro-data-panel__empty hydro-data-panel__empty--${tone}`} role="status">
      <span className="hydro-data-panel__empty-icon" aria-hidden="true">
        <Icon size={24} stroke={1.7} />
      </span>
      <Text className="hydro-data-panel__empty-message">{message}</Text>
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
            const acceptance = Number(problem.nSubmit) > 0
              ? `${Math.round((Number(problem.nAccept) || 0) / Number(problem.nSubmit) * 100)}%`
              : '—';
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
                <span className="hydro-data-row__meta">{acceptance}</span>
                <IconChevronRight className="hydro-data-row__arrow" size={17} stroke={1.8} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ) : (
        <DataPanelEmptyState icon={IconCode} message={t('No problems found')} />
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
          {contests.map((contest: any) => (
            <Link
              key={contest.docId || contest._id}
              to="contest_detail"
              params={{ tid: contest.docId || contest._id, ...(contest.domainId ? { domainId: contest.domainId } : {}) }}
              className="hydro-data-row hydro-contest-row"
            >
              <span className="hydro-data-row__title">{contest.title}</span>
              {contest.rule ? <Badge size="xs" variant="light">{contest.rule}</Badge> : null}
              <span className="hydro-data-row__meta">
                <TimeDisplay date={contest.beginAt} format="relative" />
              </span>
              <IconChevronRight className="hydro-data-row__arrow" size={17} stroke={1.8} aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <DataPanelEmptyState icon={IconTrophy} message={t('No contests found')} tone="accent" />
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
