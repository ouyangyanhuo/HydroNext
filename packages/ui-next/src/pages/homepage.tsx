import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

function WelcomeCard() {
  const user = useSessionStore((s) => s.user);
  const { t } = useI18n();
  const isLoggedIn = user._id > 0;

  return (
    <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
      <Badge variant="light" color="hydroTeal" mb="md">
        {t('Online Judge')}
      </Badge>
      <Title order={1} className="max-w-2xl text-4xl leading-[1.05] text-[var(--hydro-text)] md:text-5xl">
        {isLoggedIn ? `${t('Welcome')}, ${user.uname}` : t('Welcome to Hydro')}
      </Title>
      <Text c="dimmed" size="md" mt="md" className="max-w-xl">
        {isLoggedIn
          ? t('Explore problems, contests, and improve your skills.')
          : t('Login or register to start solving problems.')}
      </Text>
      {!isLoggedIn && (
        <Group mt="xl" gap="sm">
          <Button component={Link} to="user_login">{t('Login')}</Button>
          <Button component={Link} to="user_register" variant="light">{t('Register')}</Button>
        </Group>
      )}
    </Card>
  );
}

function BulletinCard({ bulletin }: { bulletin: string }) {
  const { t } = useI18n();

  if (!bulletin) return null;

  return (
    <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]">
      <MarkdownRenderer content={bulletin} />
    </Card>
  );
}

function ProblemList({ problems }: { problems: any[] }) {
  const { t } = useI18n();

  if (!problems || problems.length === 0) return null;

  return (
    <Card withBorder p="lg" className="hydro-card">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('Recent Problems')}</Title>
        <Button component={Link} to="problem_main" variant="subtle" size="xs">
          {t('View All')}
        </Button>
      </Group>
      <Stack gap={6}>
        {problems.map((p: any) => (
          <Group key={p.docId || p._id} justify="space-between" wrap="nowrap" className="min-w-0 rounded-md px-2 py-2 hover:bg-[var(--hydro-surface-muted)]">
            <Link
              to="problem_detail"
              params={{ pid: p.pid || p.docId }}
              className="hydro-subtle-link min-w-0 truncate text-sm font-semibold"
            >
              <span className="text-[var(--hydro-primary)]">{p.pid || p.docId}</span> {p.title}
            </Link>
            {p.nSubmit > 0 && (
              <Text size="xs" c="dimmed" className="shrink-0">
                {p.nAccept}/{p.nSubmit}
              </Text>
            )}
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function RecentContests({ contests }: { contests: any[] }) {
  const { t } = useI18n();

  if (!contests || contests.length === 0) return null;

  return (
    <Card withBorder p="lg" className="hydro-card">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('Recent Contests')}</Title>
        <Button component={Link} to="contest_main" variant="subtle" size="xs">
          {t('View All')}
        </Button>
      </Group>
      <Stack gap={6}>
        {contests.map((c: any) => (
          <Group key={c.docId || c._id} justify="space-between" wrap="nowrap" className="min-w-0 rounded-md px-2 py-2 hover:bg-[var(--hydro-surface-muted)]">
            <Link
              to="contest_detail"
              params={{ tid: c.docId || c._id }}
              className="hydro-subtle-link min-w-0 truncate text-sm font-semibold"
            >
              {c.title}
            </Link>
            <Group gap="xs" wrap="nowrap" className="shrink-0">
              {c.rule && <Badge size="xs" variant="light">{c.rule}</Badge>}
              <TimeDisplay date={c.beginAt} format="relative" />
            </Group>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function RecentDiscussions({ discussions }: { discussions: any[] }) {
  const { t } = useI18n();

  if (!discussions || discussions.length === 0) return null;

  return (
    <Card withBorder p="lg" className="hydro-card">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('Recent Discussions')}</Title>
        <Button component={Link} to="discussion_main" variant="subtle" size="xs">
          {t('View All')}
        </Button>
      </Group>
      <Stack gap={6}>
        {discussions.map((d: any) => (
          <Group key={d.docId || d._id} justify="space-between" wrap="nowrap" className="min-w-0 rounded-md px-2 py-2 hover:bg-[var(--hydro-surface-muted)]">
            <Link
              to="discussion_detail"
              params={{ did: d.docId || d._id }}
              className="hydro-subtle-link min-w-0 truncate text-sm font-semibold"
            >
              {d.title}
            </Link>
            <div className="shrink-0">
              <TimeDisplay date={d.updateAt || d.createdAt} format="relative" />
            </div>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function StatStrip({ problems, contests, discussions }: { problems: any[], contests: any[], discussions: any[] }) {
  const { t } = useI18n();
  const items = [
    { label: t('Problems'), value: problems.length, tone: 'var(--hydro-primary)' },
    { label: t('Contests'), value: contests.length, tone: 'var(--hydro-accent)' },
    { label: t('Discussion'), value: discussions.length, tone: 'var(--hydro-success)' },
  ];

  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
      {items.map((item) => (
        <Card key={item.label} withBorder p="md" className="hydro-card">
          <Text size="xs" fw={700} c="dimmed">
            {item.label}
          </Text>
          <Text size="xl" fw={800} mt={4} style={{ color: item.tone }}>
            {item.value}
          </Text>
        </Card>
      ))}
    </SimpleGrid>
  );
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
  const problems = sectionList(sections.problems || sections.starredProblems || sections.recentProblems || sections.recent_problems);
  const contests = sectionList(sections.contests || sections.contest);
  const discussions = sectionList(sections.discussions || sections.discussion);

  return (
    <Stack gap="xl">
      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
        <div className="lg:col-span-2">
          <WelcomeCard />
        </div>
        <Stack gap="lg">
          <ProblemList problems={problems} />
          <StatStrip problems={problems} contests={contests} discussions={discussions} />
        </Stack>
      </SimpleGrid>
      {domain.bulletin && <BulletinCard bulletin={domain.bulletin} />}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <RecentContests contests={contests} />
        <RecentDiscussions discussions={discussions} />
      </SimpleGrid>
    </Stack>
  );
}
