import './ranking.css';

import {
  Avatar, Button, Group, Stack, Table, Text, TextInput, Title,
} from '@mantine/core';
import {
  IconChartBar, IconCrown, IconMedal, IconSearch, IconTrophy,
} from '@tabler/icons-react';
import { useDeferredValue, useState } from 'react';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { getAvatarUrl } from '@/utils/avatar';

interface RankingUser {
  _id: number;
  uname: string;
  avatar?: string;
  rp?: number;
}

function getRp(user: RankingUser) {
  return Math.round(Number(user.rp) || 0);
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
      || String(user._id).includes(deferredSearch));
  const getSolved = (user: RankingUser) => solvedCounts[user._id] || 0;
  const podium = page === 1 ? [udocs[1], udocs[0], udocs[2]] : [];
  const emptyMessage = search.trim() ? 'No users match your search.' : 'No users in this domain yet.';

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
                <Avatar src={getAvatarUrl(user.avatar || '')} size={rank === 1 ? 68 : 58} radius="xl" className="ranking-podium-avatar" />
                <Text className="ranking-podium-name" fw={700} truncate>{user.uname}</Text>
                <div className="ranking-podium-stats">
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
          <Table className="ranking-table" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('Rank')}</Table.Th>
                <Table.Th>{t('User')}</Table.Th>
                <Table.Th>{t('Solved')}</Table.Th>
                <Table.Th>{t('RP')}</Table.Th>
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
                      <Avatar src={getAvatarUrl(user.avatar || '')} size={27} radius="xl" />
                      <span>{user.uname}</span>
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
