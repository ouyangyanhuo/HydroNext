import { Badge, Button, Group, Paper, Select, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function starKey(tdoc: any) {
  return `scoreboard-star/${tdoc.domainId}/${tdoc.docId || tdoc._id}`;
}

function scoreColor(score: any) {
  const value = Number(score);
  if (!Number.isFinite(value)) return undefined;
  if (value >= 100) return 'green';
  if (value > 0) return 'yellow';
  return 'gray';
}

function isContestOngoing(tdoc: any) {
  const now = Date.now();
  return new Date(tdoc.beginAt).getTime() <= now && now <= new Date(tdoc.endAt).getTime();
}

function CellValue({ cell, canViewRecord }: { cell: any; canViewRecord: boolean }) {
  if (cell.type === 'record' && cell.raw && canViewRecord) {
    return (
      <Link to="record_detail" params={{ rid: cell.raw }} className="no-underline">
        <Badge size="xs" color={scoreColor(cell.score ?? cell.value)} variant="light">{cell.value}</Badge>
      </Link>
    );
  }
  if (cell.type === 'records' && Array.isArray(cell.raw)) {
    return (
      <Group gap={2} justify="center">
        {cell.raw.map((item: any, index: number) => (
          <span key={index}>
            {index > 0 ? '/' : ''}
            {item.raw && canViewRecord ? (
              <Link to="record_detail" params={{ rid: item.raw }} className="no-underline">
                <Text component="span" size="xs" fw={700}>{item.value}</Text>
              </Link>
            ) : (
              <Text component="span" size="xs">{item.value}</Text>
            )}
          </span>
        ))}
      </Group>
    );
  }
  if (cell.type === 'rank') {
    return <Text size="sm" fw={700}>{String(cell.value) === '0' ? '*' : cell.value}</Text>;
  }
  if (cell.type === 'record') {
    return <Badge size="xs" color={scoreColor(cell.score ?? cell.value)} variant="light">{cell.value || '-'}</Badge>;
  }
  return <Text size="sm" className="whitespace-pre-wrap">{cell.value}</Text>;
}

export default function ContestScoreboardPage() {
  const { args, name } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const user = useCurrentUser();
  const rows = args.rows || [];
  const header = rows[0] || [];
  const bodyRows = rows.slice(1);
  const tdoc = args.tdoc || {};
  const tid = tdoc.docId || tdoc._id;
  const udict = args.udict || {};
  const pdict = args.pdict || {};
  const groups = args.groups || [];
  const availableViews = args.availableViews || {};
  const viewRoute = name === 'homework_scoreboard' ? 'homework_scoreboard_view' : 'contest_scoreboard_view';
  const [filter, setFilter] = useState(() => {
    const hash = window.location.hash.slice(1);
    return hash.startsWith('filter=') ? hash.slice(7) : 'all';
  });
  const [stars, setStars] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(starKey(tdoc)) || '[]');
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(starKey(tdoc), JSON.stringify(stars));
  }, [stars, tdoc]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (isContestOngoing(tdoc)) navigate(window.location.pathname + window.location.search + window.location.hash);
    }, 180000);
    return () => window.clearInterval(timer);
  }, [navigate, tdoc]);

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.slice(1);
      if (hash.startsWith('filter=')) setFilter(hash.slice(7));
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const filterOptions = useMemo(() => [
    { value: 'all', label: t('All Users') },
    { value: 'star', label: t('Starred Users') },
    { value: 'rank', label: t('Ranked Users') },
    ...groups.map((group: any) => ({ value: (group.uids || []).join(','), label: group.name })),
  ], [groups, t]);

  const visibleRows = useMemo(() => bodyRows.filter((row: any[]) => {
    const userCell = row.find((cell) => cell.type === 'user');
    const rankCell = row.find((cell) => cell.type === 'rank');
    const uid = Number(userCell?.raw);
    if (filter === 'all') return true;
    if (filter === 'star') return stars.includes(uid);
    if (filter === 'rank') return String(rankCell?.value) !== '0';
    const uids = filter.split(',').map((item) => Number(item.trim())).filter(Boolean);
    return uids.includes(uid);
  }), [bodyRows, filter, stars]);

  const toggleStar = (uid: number) => {
    setStars((current) => current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]);
  };

  const setFilterAndHash = (value: string) => {
    setFilter(value);
    history.replaceState(null, '', `#filter=${value}`);
  };

  const unlock = async () => {
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'unlock' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed')));
      notifications.show({ title: t('Saved'), message: '', color: 'green' });
      navigate(window.location.pathname + window.location.search);
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg" className={`scoreboard--${tdoc.rule || 'contest'}`}>
      <Paper withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
        <Group justify="space-between" align="flex-start" gap="md">
          <div className="min-w-0">
            <Title order={2}>{tdoc.title}</Title>
            <Text size="sm" c="dimmed">{t('Scoreboard')}</Text>
          </div>
          <Group gap="xs" wrap="wrap" justify="flex-end">
            {['html', 'csv', 'ghost'].map((view) => (
              <Button key={view} component={Link} href={buildUrl(viewRoute, { tid, view })} target="_blank" size="xs" variant="light">
                {t('Export as {0}').replace('{0}', view.toUpperCase())}
              </Button>
            ))}
            {Object.entries(availableViews).filter(([id]) => !['html', 'csv', 'default', 'ghost'].includes(id)).map(([id, label]: [string, any]) => (
              <Button key={id} component={Link} href={buildUrl(viewRoute, { tid, view: id })} target="_blank" size="xs" variant="subtle">
                {t(String(label))}
              </Button>
            ))}
            {tdoc.lockAt && !tdoc.unlocked && new Date(tdoc.endAt).getTime() <= Date.now() && (
              <Button size="xs" variant="light" onClick={unlock} loading={loading}>{t('Unlock scoreboard')}</Button>
            )}
          </Group>
        </Group>

        <Group justify="flex-end" mt="md">
          <Select data={filterOptions} value={filter} onChange={(value) => setFilterAndHash(value || 'all')} size="xs" w={200} />
        </Group>
      </Paper>

      {tdoc.lockAt && !tdoc.unlocked && (
        <Paper withBorder p="md" className="bg-[var(--hydro-surface)]">
          <Text size="sm" c="dimmed">
            {new Date(tdoc.endAt).getTime() <= Date.now()
              ? t('Please wait until contest host unfreeze the scoreboard.')
              : t('The scoreboard was frozen.')}
          </Text>
        </Paper>
      )}

      <Paper withBorder className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                {header.map((column: any, index: number) => (
                  <Table.Th key={index} className={`col--${column.type || 'string'}`}>
                    {column.type === 'problem' && column.raw ? (
                      <Link href={buildUrl('problem_detail', { pid: column.raw }, { tid: String(tid) })} className="hydro-subtle-link">
                        <Text size="xs" fw={800}>{column.value}</Text>
                        <Text size="xs" c="dimmed">{pdict[column.raw]?.nAccept || 0}/{pdict[column.raw]?.nSubmit || 0}</Text>
                      </Link>
                    ) : (
                      <Text size="xs" fw={800} className="whitespace-pre-wrap">{column.value}</Text>
                    )}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleRows.map((row: any[], rowIndex: number) => {
                const userCell = row.find((cell) => cell.type === 'user');
                const uid = Number(userCell?.raw);
                const isStarred = stars.includes(uid) || uid === user?._id;
                return (
                  <Table.Tr key={uid || rowIndex} className={isStarred ? 'bg-[var(--hydro-primary-soft)]' : undefined}>
                    {row.map((cell, index) => {
                      const column = header[index] || {};
                      const canViewRecord = Boolean(args.canViewRecord || uid === user?._id);
                      return (
                        <Table.Td key={index} className={`col--${column.type || cell.type || 'string'}`}>
                          {cell.type === 'user' ? (
                            <Group gap="xs" wrap="nowrap">
                              <Button size="compact-xs" variant={stars.includes(uid) ? 'filled' : 'subtle'} onClick={() => toggleStar(uid)}>
                                {stars.includes(uid) ? '★' : '☆'}
                              </Button>
                              <Link to="user_detail" params={{ uid }} className="no-underline hover:underline">
                                <Text size="sm">{udict[uid]?.displayName || udict[uid]?.uname || cell.value || uid}</Text>
                              </Link>
                            </Group>
                          ) : (
                            <CellValue cell={cell} canViewRecord={canViewRecord} />
                          )}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      </Paper>
    </Stack>
  );
}
