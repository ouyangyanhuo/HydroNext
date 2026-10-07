import { Anchor, Badge, Card, Group, Paper, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { OwnedHonorFrames } from '@/components/user/owned-honor-frames';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatUserName } from '@/utils/user-name';

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
  const buildUrl = useBuildUrl();
  const currentUser = useSessionStore((s) => s.user);
  const [tab, setTab] = useState<string | null>(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('tab') === 'frames') return 'frames';
    return query.get('tab') === 'accepted' || query.has('page') ? 'accepted' : 'bio';
  });

  const udoc = args.udoc || {};
  const stats = args.stats || udoc;
  const sdoc = args.sdoc || {};
  const pdocs = args.pdocs || [];
  const tags = args.tags || [];
  const isSelf = currentUser._id === udoc._id;
  const canViewRecords = Boolean(args.canViewRecords ?? isSelf);

  const rankValue = Number(stats.rank);
  const rank = Number.isFinite(rankValue) && rankValue > 0 ? `#${rankValue}` : '-';
  const rpValue = Number(stats.rp);
  const rp = Number.isFinite(rpValue) ? String(Math.round(rpValue * 100) / 100) : '0';
  const backgroundUrl = getBackgroundUrl(udoc._id || 0);

  return (
    <main className="hydro-user-profile">
      <Stack gap="lg">
        <Paper withBorder className="hydro-content-card hydro-user-profile__hero overflow-hidden">
          <div className="hydro-user-profile__cover">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${backgroundUrl})` }}
            />
            <div className="hydro-user-profile__cover-overlay" />
          </div>
          <div className="hydro-user-profile__info">
            <div className="hydro-user-profile__info-layout">
              <div className="hydro-user-profile__identity">
                <UserAvatar
                  user={udoc}
                  link={false}
                  size={96}
                  shape="circle"
                  frameClassName="hydro-user-profile__avatar-slot"
                  className="hydro-user-profile__avatar"
                />
                <Stack gap={6} className="hydro-user-profile__identity-text">
                  <Group gap="sm" align="baseline">
                    <Title order={3}>{formatUserName(udoc)}</Title>
                    <Text size="xs" c="dimmed">UID {udoc._id}</Text>
                  </Group>
                </Stack>
              </div>
              {isSelf && <Button
                component={Link}
                to="home_settings"
                params={{ category: 'account' }}
                size="sm"
                variant="light"
                className="hydro-user-profile__edit">{t('Edit Profile')}</Button>}
            </div>
            <div className="hydro-user-profile__facts">
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
            </div>
          </div>
        </Paper>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" className="hydro-user-profile__stats">
          <Paper withBorder p="md" ta="center" className="hydro-user-profile__stat">
            <Text size="xl" fw={700}>{Number(stats.nAccept) || 0}</Text>
            <Text size="xs" c="dimmed">{t('Solved')}</Text>
          </Paper>
          {canViewRecords ? (
            <Link
              href={buildUrl('record_main', {}, { uidOrName: String(udoc._id) })}
              className="no-underline"
            >
              <Paper
                withBorder
                p="md"
                ta="center"
                className="hydro-user-profile__stat hydro-user-profile__stat--interactive"
              >
                <Text size="xl" fw={700}>{Number(stats.nSubmit) || 0}</Text>
                <Text size="xs" c="dimmed">{t('Submissions')}</Text>
              </Paper>
            </Link>
          ) : (
            <Paper
              withBorder
              p="md"
              ta="center"
              aria-disabled="true"
              title={t("View other's records")}
              className="hydro-user-profile__stat hydro-user-profile__stat--disabled"
            >
              <Text size="xl" fw={700}>{Number(stats.nSubmit) || 0}</Text>
              <Text size="xs" c="dimmed">{t('Submissions')}</Text>
            </Paper>
          )}
          <Paper withBorder p="md" ta="center" className="hydro-user-profile__stat">
            <Text size="xl" fw={700}>{rp}</Text>
            <Text size="xs" c="dimmed">{t('RP')}</Text>
          </Paper>
          <Paper withBorder p="md" ta="center" className="hydro-user-profile__stat">
            <Text size="xl" fw={700}>{rank}</Text>
            <Text size="xs" c="dimmed">{t('Rank')}</Text>
          </Paper>
        </SimpleGrid>

        <Tabs value={tab} onChange={setTab} className="hydro-user-profile__tabs">
          <Tabs.List className="hydro-user-profile__tablist">
            <Tabs.Tab value="bio">{t('Bio')}</Tabs.Tab>
            <Tabs.Tab value="accepted">{t('Accepted Problems')}</Tabs.Tab>
            <Tabs.Tab value="frames">{t('Owned honor frames')}</Tabs.Tab>
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
                  {t('Accepted')}: {args.acceptedCount ?? pdocs.length}
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
                      <Paper withBorder p="sm" className="hydro-user-profile__problem">
                        <Text size="sm" fw={500} truncate>{pdoc.title || pdoc.docId || pdoc._id}</Text>
                        {pdoc.pid && (
                          <Text size="xs" c="dimmed">{pdoc.pid}</Text>
                        )}
                      </Paper>
                    </Anchor>
                  ))}
                </SimpleGrid>
                <Paginator
                  page={Number(args.acceptedPage) || 1}
                  totalPages={Number(args.acceptedPageCount) || 1}
                  baseUrl={buildUrl('user_detail', { uid: udoc._id }, { tab: 'accepted' })}
                />
              </>
            ) : (
              <Text c="dimmed" ta="center" py="xl">{t('No accepted problems')}</Text>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="frames" pt="md">
            {tab === 'frames' && <OwnedHonorFrames key={udoc._id} uid={udoc._id} avatar={udoc.avatar} />}
          </Tabs.Panel>
        </Tabs>

        {tags.length > 0 && (
          <Card withBorder p="lg" className="hydro-content-card hydro-user-profile__tags">
            <Title order={4} mb="sm">{t('Problem Tags')}</Title>
            <Group gap="xs">
              {tags.map((tag: any) => {
                const name = Array.isArray(tag) ? tag[0] : (tag.name || tag._id);
                const count = Array.isArray(tag) ? tag[1] : tag.count;
                return (
                  <Badge key={name} variant="light">
                    {name} ({Number(count) || 0})
                  </Badge>
                );
              })}
            </Group>
          </Card>
        )}
      </Stack>
    </main>
  );
}
