import './ranking.css';

import { Group, Stack, Table, Text, TextInput, Title, Tooltip } from '@mantine/core';
import {
  IconChartBar, IconCrown, IconInfoCircle, IconMedal, IconSearch, IconTrophy,
} from '@tabler/icons-react';
import { useDeferredValue, useState } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { formatUserName } from '@/utils/user-name';

interface RankingUser {
  _id: number;
  uname: string;
  avatar?: string;
  displayName?: string;
  rp?: number;
}

function getRp(user: RankingUser) {
  return Math.round(Number(user.rp) || 0);
}

function RpInformation() {
  const { t } = useI18n();
  return <Tooltip
    withArrow
    withinPortal
    multiline
    w={420}
    maw="calc(100vw - 32px)"
    openDelay={150}
    events={{ hover: true, focus: true, touch: true }}
    label={<Stack gap="xs">
      <Text size="sm" fw="var(--hydro-weight-semibold)">{t('How RP is calculated')}</Text>
      <Text size="xs">{t(
        'RP combines problem points, rated-contest points and extra adjustments within this domain. It is not the solved-problem count.',
      )}</Text>
      <Text size="xs">{t(
        'Problem total S: sum min(score, 100) × difficulty / 100 for public problems with at least one accepted submission.'
        + ' Your own problems are excluded; each problem counts once.',
      )}</Text>
      <Text size="xs">{t(
        'Difficulty uses the problem setting, otherwise submission statistics, with a fallback of 5.'
        + ' Problem points = max(0, min(S, ln(S) / ln(1.03))); zero when S = 0.',
      )}</Text>
      <Text size="xs">{t(
        'Rated contests use a Codeforces-style rating algorithm based on ranks and opponent ratings.'
        + ' Contest points = max(1, rating / 4 - 375). The current script processes at most 10 contests.',
      )}</Text>
      <Text size="xs">{t(
        'Final RP = max(0, problem points + contest points + extra adjustments).'
        + ' Updated by the daily task or administrator recalculation, not immediately after each submission.',
      )}</Text>
    </Stack>}
  >
    <ActionIcon variant="subtle" color="gray" size="xs" aria-label={t('About RP')}>
      <IconInfoCircle size={15} stroke={1.8} aria-hidden="true" />
    </ActionIcon>
  </Tooltip>;
}

export default function RankingPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const udocs: RankingUser[] = args.udocs || args.ulist || [];
  const solvedCounts: Record<number, number> = args.solvedCounts || {};
  const solvedRanking = args.sort === 'solved';
  const page = args.page || 1;
  const upcount = args.upcount || 1;
  const pageSize = args.limit || 100;
  const visibleUsers = udocs
    .map((user, index) => ({ user, rank: (page - 1) * pageSize + index + 1 }))
    .filter(({ user }) => !deferredSearch || user.uname?.toLocaleLowerCase().includes(deferredSearch)
      || user.displayName?.toLocaleLowerCase().includes(deferredSearch)
      || String(user._id).includes(deferredSearch));
  const getSolved = (user: RankingUser) => solvedCounts[user._id] || 0;
  const podium = page === 1 ? [udocs[1], udocs[0], udocs[2]] : [];
  const emptyMessage = search.trim() ? 'No users match your search.' : 'No users in this domain have solved a problem.';

  return (
    <Stack gap="xl" className="ranking-page">
      <header className="ranking-page-header">
        <Group gap="md" align="center" wrap="nowrap">
          <span className="ranking-page-icon" aria-hidden="true"><IconChartBar size={28} stroke={2.2} /></span>
          <div>
            <Title order={1} className="ranking-page-title">{t('Ranking')}</Title>
            <Text size="sm" c="dimmed">{t('See every effort. Grow through code.')}</Text>
          </div>
        </Group>
        <div className="ranking-switch" role="group" aria-label={t('Ranking type')}>
          <Button
            component={Link}
            href={buildUrl('ranking', {}, { sort: 'rp' })}
            variant={solvedRanking ? 'subtle' : 'filled'}
            size="sm"
            aria-current={solvedRanking ? undefined : 'page'}
          >
            {t('RP Ranking')}
          </Button>
          <Button
            component={Link}
            href={buildUrl('ranking')}
            variant={solvedRanking ? 'filled' : 'subtle'}
            size="sm"
            aria-current={solvedRanking ? 'page' : undefined}
          >
            {t('Solved Ranking')}
          </Button>
        </div>
      </header>

      {podium.some(Boolean) && (
        <section className="ranking-podium" aria-label={t('Top three')}>
          {podium.map((user, index) => {
            if (!user) return <div key={`empty-${index}`} className="ranking-podium-spacer" />;
            const rank = [2, 1, 3][index];
            return (
              <Link key={user._id} to="user_detail" params={{ uid: user._id }} className={`ranking-podium-card ranking-podium-card--${rank}`}>
                <span className="ranking-podium-watermark" aria-hidden="true">#{rank}</span>
                <span className="ranking-podium-medal" aria-hidden="true">
                  {rank === 1 ? <IconCrown size={34} stroke={1.7} /> : <IconMedal size={30} stroke={1.6} />}
                </span>
                <UserAvatar user={user} link={false} size={rank === 1 ? 68 : 58} className="ranking-podium-avatar" />
                <Text className="ranking-podium-name" fw={700} truncate>{formatUserName(user)}</Text>
                <div className="ranking-podium-stats hydro-numeric">
                  <div><strong>{getSolved(user)}</strong><span>{t('Solved')}</span></div>
                  <div><strong>{getRp(user)}</strong><span>{t('RP')}</span></div>
                </div>
                <span className="ranking-podium-number">#{rank}</span>
              </Link>
            );
          })}
        </section>
      )}

      <section className="ranking-list" aria-label={t('Leaderboard')}>
        <div className="ranking-list-header">
          <Group gap="sm" wrap="nowrap">
            <span className="ranking-list-icon" aria-hidden="true"><IconTrophy size={25} stroke={1.8} /></span>
            <div>
              <Title order={2} size="h4">{t('Leaderboard')}</Title>
              <Text size="xs" c="dimmed">
                {t(solvedRanking ? 'Ranked by distinct accepted problems in this domain.' : 'Ranked by RP in this domain.')}
              </Text>
            </div>
          </Group>
          <TextInput
            aria-label={t('Search users on this page')}
            placeholder={t('Search users on this page')}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            className="ranking-search"
          />
        </div>
        <div className="ranking-table-scroll">
          <Table className="ranking-table hydro-numeric" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('Rank')}</Table.Th>
                <Table.Th>{t('User')}</Table.Th>
                <Table.Th>{t('Solved')}</Table.Th>
                <Table.Th>
                  <Group gap={4} justify="center" wrap="nowrap">
                    <span>{t('RP')}</span>
                    <RpInformation />
                  </Group>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleUsers.map(({ user, rank }) => (
                <Table.Tr key={user._id} className={rank === 1 ? 'ranking-table-first' : undefined}>
                  <Table.Td>
                    <span className={`ranking-table-rank ranking-table-rank--${Math.min(rank, 4)}`}>
                      {rank === 1 ? <IconCrown size={18} /> : rank <= 3 ? <IconMedal size={17} /> : null}
                      {rank}
                    </span>
                  </Table.Td>
                  <Table.Td>
                    <Link to="user_detail" params={{ uid: user._id }} className="ranking-table-user">
                      <UserAvatar user={user} link={false} size={27} />
                      <span>{formatUserName(user)}</span>
                    </Link>
                  </Table.Td>
                  <Table.Td fw={solvedRanking ? 700 : undefined}>{getSolved(user)}</Table.Td>
                  <Table.Td fw={solvedRanking ? undefined : 700}>{getRp(user)}</Table.Td>
                </Table.Tr>
              ))}
              {!visibleUsers.length && (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text ta="center" c="dimmed" py="xl">
                      {t(emptyMessage)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
        <Paginator page={page} totalPages={upcount} />
      </section>
    </Stack>
  );
}
