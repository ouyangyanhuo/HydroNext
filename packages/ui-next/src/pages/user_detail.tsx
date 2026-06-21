import { getAvatarUrl } from '@/utils/avatar';
import { Anchor, Badge, Button, Card, Group, Paper, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { TimeDisplay } from '@/components/common/time-display';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

const BACKGROUND_COUNT = 21;

function getBackgroundUrl(uid: number): string {
  const index = (uid % BACKGROUND_COUNT) + 1;
  return `/backgrounds/${index}.jpg`;
}

function formatGender(gender: any, t: (key: string) => string) {
  const value = Number(gender);
  if (value === 0) return t('Male');
  if (value === 1) return t('Female');
  if (value === 2) return t('Other');
  return '';
}

export default function UserDetailPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const currentUser = useSessionStore((s) => s.user);
  const [tab, setTab] = useState<string | null>('bio');

  const udoc = args.udoc || {};
  const sdoc = args.sdoc || {};
  const pdocs = args.pdocs || [];
  const tags = args.tags || [];
  const isSelf = currentUser._id === udoc._id;

  const rank = useMemo(() => {
    if (!udoc.rp) return '-';
    return `#${udoc.rank || '-'}`;
  }, [udoc.rp, udoc.rank]);

  const backgroundUrl = useMemo(() => getBackgroundUrl(udoc._id || 0), [udoc._id]);

  return (
    <Stack gap="lg">
      <Paper withBorder className="hydro-content-card overflow-hidden">
        <div className="relative h-32">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundUrl})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, var(--hydro-surface) 100%)',
            }}
          />
        </div>
        <div className="px-lg py-lg user-info">
          <Group justify="space-between" align="flex-start">
            <Group gap="lg" align="flex-start">
              <img
                src={getAvatarUrl(udoc.avatar || '', 96)}
                alt=""
                className="h-20 w-20 rounded-full border-4 border-[var(--hydro-surface)] object-cover shadow-md"
              />
              <Stack gap={6}>
                <Group gap="sm" align="baseline">
                  <Title order={3}>{udoc.displayName || udoc.uname}</Title>
                  {udoc.displayName && (
                    <Text size="sm" c="dimmed">({udoc.uname})</Text>
                  )}
                  <Text size="xs" c="dimmed">UID {udoc._id}</Text>
                </Group>
                <Group gap="md" wrap="wrap">
                </Group>
                <Group gap="md">
                  <Text size="xs" c="dimmed" component="span">
                    {t('Joined')}: <br /><TimeDisplay date={udoc.regat} format="absolute" size="xs" />
                  </Text>
                  {udoc.loginat && (
                    <Text size="xs" c="dimmed" component="span">
                      {t('Last login')}: <br /><TimeDisplay date={udoc.loginat} format="relative" size="xs" />
                    </Text>
                  )}
                  {sdoc.updateAt && (
                    <Text size="xs" c="dimmed" component="span">
                      {t('Last active')}: <br /><TimeDisplay date={sdoc.updateAt} format="relative" size="xs" />
                    </Text>
                  )}
                  {formatGender(udoc.gender, t) && (
                    <Text size="xs" c="dimmed" component="span">
                      {t('Gender')}: <br />{formatGender(udoc.gender, t)}
                    </Text>
                  )}
                  {udoc.school && (
                    <Text size="xs" c="dimmed" component="span">
                      {t('School')}: <br />{udoc.school}
                    </Text>
                  )}
                  {udoc.studentId && (
                    <Text size="xs" c="dimmed" component="span">
                      {t('Student ID')}: <br />{udoc.studentId}
                    </Text>
                  )}
                  {udoc.qq && (
                    <Text size="xs" c="dimmed" component="span">
                      QQ: <br />{udoc.qq}
                    </Text>
                  )}
                  {udoc.phone && (
                    <Text size="xs" c="dimmed" component="span">
                      {t('Phone')}: <br />{udoc.phone}
                    </Text>
                  )}
                </Group>
              </Stack>
            </Group>
            <Group gap="sm">
              {isSelf && (
                <Button component="a" href="/home/settings/account" size="xs" variant="light">
                  {t('Edit Profile')}
                </Button>
              )}
              {!isSelf && udoc._id && (
                <Button component="a" href={`/home/messages?target=${udoc._id}`} size="xs" variant="light">
                  {t('Send Message')}
                </Button>
              )}
            </Group>
          </Group>
        </div>
      </Paper>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <Paper withBorder p="md" ta="center">
          <Text size="xl" fw={700}>{udoc.nAccept || 0}</Text>
          <Text size="xs" c="dimmed">{t('Solved')}</Text>
        </Paper>
        <Paper withBorder p="md" ta="center">
          <Text size="xl" fw={700}>{udoc.nSubmit || 0}</Text>
          <Text size="xs" c="dimmed">{t('Submissions')}</Text>
        </Paper>
        <Paper withBorder p="md" ta="center">
          <Text size="xl" fw={700}>{udoc.rp || 0}</Text>
          <Text size="xs" c="dimmed">{t('RP')}</Text>
        </Paper>
        <Paper withBorder p="md" ta="center">
          <Text size="xl" fw={700}>{rank}</Text>
          <Text size="xs" c="dimmed">{t('Rank')}</Text>
        </Paper>
      </SimpleGrid>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          <Tabs.Tab value="bio">{t('Bio')}</Tabs.Tab>
          <Tabs.Tab value="accepted">{t('Accepted Problems')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="bio" pt="md">
          {udoc.bio ? (
            <Card withBorder p="lg" className="hydro-content-card">
              <MarkdownRenderer content={udoc.bio} />
            </Card>
          ) : (
            <Text c="dimmed" ta="center" py="xl">{t('No bio')}</Text>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="accepted" pt="md">
          {pdocs.length > 0 ? (
            <>
              <Text size="sm" c="dimmed" mb="sm">
                {t('Accepted')}: {pdocs.length}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="sm">
                {pdocs.map((pdoc: any) => (
                  <Anchor
                    key={pdoc.docId || pdoc._id}
                    component={Link}
                    to="problem_detail"
                    params={{ pid: pdoc.docId || pdoc._id }}
                    underline="never"
                  >
                    <Paper withBorder p="sm" className="hover:border-[var(--hydro-border-strong)] transition-colors">
                      <Text size="sm" fw={500} truncate>{pdoc.title || pdoc.docId || pdoc._id}</Text>
                      {pdoc.pid && (
                        <Text size="xs" c="dimmed">{pdoc.pid}</Text>
                      )}
                    </Paper>
                  </Anchor>
                ))}
              </SimpleGrid>
            </>
          ) : (
            <Text c="dimmed" ta="center" py="xl">{t('No accepted problems')}</Text>
          )}
        </Tabs.Panel>
      </Tabs>

      {tags.length > 0 && (
        <Card withBorder p="lg" className="hydro-content-card">
          <Title order={4} mb="sm">{t('Problem Tags')}</Title>
          <Group gap="xs">
            {tags.map((tag: any) => (
              <Badge key={tag._id || tag.name} variant="light">
                {tag.name || tag._id} ({tag.count || 0})
              </Badge>
            ))}
          </Group>
        </Card>
      )}
    </Stack>
  );
}
