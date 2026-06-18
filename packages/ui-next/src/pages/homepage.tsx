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
    <Card withBorder p="lg">
      <Title order={3} mb="sm">
        {isLoggedIn ? `${t('Welcome')}, ${user.uname}!` : t('Welcome to Hydro')}
      </Title>
      <Text c="dimmed" size="sm">
        {isLoggedIn
          ? t('Explore problems, contests, and improve your skills.')
          : t('Login or register to start solving problems.')}
      </Text>
      {!isLoggedIn && (
        <Group mt="md" gap="xs">
          <Button component={Link} to="user_login" size="xs">{t('Login')}</Button>
          <Button component={Link} to="user_register" variant="light" size="xs">{t('Register')}</Button>
        </Group>
      )}
    </Card>
  );
}

function BulletinCard({ bulletin }: { bulletin: string }) {
  if (!bulletin) return null;

  return (
    <Card withBorder p="lg">
      <MarkdownRenderer content={bulletin} />
    </Card>
  );
}

function RecentProblems({ problems }: { problems: any[] }) {
  const { t } = useI18n();

  if (!problems || problems.length === 0) return null;

  return (
    <Card withBorder p="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('Recent Problems')}</Title>
        <Button component={Link} to="problem_main" variant="subtle" size="xs">
          {t('View All')}
        </Button>
      </Group>
      <Stack gap="xs">
        {problems.map((p: any) => (
          <Group key={p.docId || p._id} justify="space-between">
            <Link
              to="problem_detail"
              params={{ pid: p.pid || p.docId }}
              className="text-sm no-underline hover:underline"
            >
              {p.pid}. {p.title}
            </Link>
            {p.nSubmit > 0 && (
              <Text size="xs" c="dimmed">
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
    <Card withBorder p="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('Recent Contests')}</Title>
        <Button component={Link} to="contest_main" variant="subtle" size="xs">
          {t('View All')}
        </Button>
      </Group>
      <Stack gap="xs">
        {contests.map((c: any) => (
          <Group key={c.docId || c._id} justify="space-between">
            <Link
              to="contest_detail"
              params={{ tid: c.docId || c._id }}
              className="text-sm no-underline hover:underline"
            >
              {c.title}
            </Link>
            <Group gap="xs">
              <Badge size="xs" variant="light">{c.rule}</Badge>
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
    <Card withBorder p="lg">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('Recent Discussions')}</Title>
        <Button component={Link} to="discussion_main" variant="subtle" size="xs">
          {t('View All')}
        </Button>
      </Group>
      <Stack gap="xs">
        {discussions.map((d: any) => (
          <Group key={d.docId || d._id} justify="space-between">
            <Link
              to="discussion_detail"
              params={{ did: d.docId || d._id }}
              className="text-sm no-underline hover:underline text-[var(--hydro-text)]"
            >
              {d.title}
            </Link>
            <TimeDisplay date={d.updateAt || d.createdAt} format="relative" />
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

export default function HomePage() {
  const { args } = usePageData();
  const contents = args.contents || [];
  const domain = args.domain || {};

  const sections: Record<string, any> = {};
  for (const section of contents) {
    if (section.columns) {
      for (const col of section.columns) {
        Object.assign(sections, col);
      }
    }
  }

  return (
    <Stack gap="lg">
      <WelcomeCard />
      {domain.bulletin && <BulletinCard bulletin={domain.bulletin} />}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <RecentProblems problems={sections.problems || sections.starredProblems || sections.recentProblems || []} />
        <RecentContests
          contests={sections.contests || []}
        />
        <RecentDiscussions
          discussions={sections.discussions || []}
        />
      </SimpleGrid>
    </Stack>
  );
}
