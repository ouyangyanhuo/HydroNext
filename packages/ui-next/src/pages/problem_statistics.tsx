import { Badge, Card, Group, Progress, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

function formatMemory(memory?: number) {
  if (memory == null) return '-';
  return `${Math.round(memory / 1024)} MB`;
}

function formatSize(size?: number) {
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatSubmitAt(value: any) {
  if (!value) return '-';
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toLocaleString();
  const text = String(value);
  if (/^[0-9a-f]{24}$/i.test(text)) {
    const time = parseInt(text.slice(0, 8), 16) * 1000;
    return new Date(time).toLocaleString();
  }
  return '-';
}

function statLabel(type: string, t: (key: string) => string) {
  const labels: Record<string, string> = {
    time: t('Time'),
    memory: t('Memory'),
    length: t('Code'),
    date: t('Submit At'),
  };
  return labels[type] || type;
}

function StatusBreakdown({ stats }: { stats: Record<string, number> }) {
  const { t } = useI18n();
  const items = ['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE']
    .map((key) => ({ key, value: stats?.[key] || 0 }))
    .filter((item) => item.value > 0);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (!total) return null;

  return (
    <Card withBorder p="lg" className="hydro-content-card">
      <Stack gap="md">
        <Title order={3} size="h4">{t('Status Distribution')}</Title>
        <Stack gap="sm">
          {items.map((item) => (
            <div key={item.key}>
              <Group justify="space-between" mb={4}>
                <Text size="xs" fw={700}>{item.key}</Text>
                <Text size="xs" c="dimmed">{item.value}</Text>
              </Group>
              <Progress value={(item.value / total) * 100} size="sm" radius="xl" />
            </div>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

export default function ProblemStatisticsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const rsdocs = args.rsdocs || [];
  const udict = args.udict || {};
  const page = args.page || 1;
  const pcount = args.pcount || 1;
  const rscount = args.rscount || rsdocs.length || 0;
  const sort = args.sort || 'time';
  const direction = String(args.direction ?? 1);
  const types = args.types || ['time', 'memory', 'length', 'date'];
  const stats = pdoc.stats || {};
  const accepted = pdoc.nAccept || 0;
  const submitted = pdoc.nSubmit || 0;
  const acceptRate = submitted ? Math.round((accepted / submitted) * 100) : 0;

  const updateQuery = (key: string, value?: string | null) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  const columns = [
    {
      key: 'status',
      title: t('Status'),
      width: 130,
      render: (r: any) => (
        <Link to="record_detail" params={{ rid: r._id }} className="no-underline">
          <RecordStatusBadge status={r.status} size="xs" />
        </Link>
      ),
    },
    {
      key: 'uid',
      title: t('Submit By'),
      width: 150,
      render: (r: any) => {
        const udoc = udict[r.uid];
        return udoc ? <UserLink user={udoc} size="xs" /> : <Text size="xs" c="dimmed">{r.uid}</Text>;
      },
    },
    {
      key: 'time',
      title: t('Time'),
      width: 90,
      align: 'right' as const,
      render: (r: any) => <Text size="xs" c="dimmed">{r.time != null ? `${Math.round(r.time)} ms` : '-'}</Text>,
    },
    {
      key: 'memory',
      title: t('Memory'),
      width: 100,
      align: 'right' as const,
      render: (r: any) => <Text size="xs" c="dimmed">{formatMemory(r.memory)}</Text>,
    },
    {
      key: 'lang',
      title: t('Language'),
      width: 110,
      render: (r: any) => <Text size="xs" c="dimmed">{r.lang || '-'}</Text>,
    },
    {
      key: 'length',
      title: t('Code'),
      width: 90,
      align: 'right' as const,
      render: (r: any) => <Text size="xs" c="dimmed">{formatSize(r.length)}</Text>,
    },
    {
      key: 'submittedAt',
      title: t('Submit At'),
      width: 170,
      render: (r: any) => <Text size="xs" c="dimmed">{formatSubmitAt(r.judgeAt || r._id)}</Text>,
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Statistics')} - ${pdoc.pid}. ${pdoc.title}`} />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Card withBorder p="md" ta="center" className="hydro-content-card">
          <Text size="xl" fw={700}>{submitted}</Text>
          <Text size="xs" c="dimmed">{t('Total Submissions')}</Text>
        </Card>
        <Card withBorder p="md" ta="center" className="hydro-content-card">
          <Text size="xl" fw={700}>{accepted}</Text>
          <Text size="xs" c="dimmed">{t('Accepted')}</Text>
        </Card>
        <Card withBorder p="md" ta="center" className="hydro-content-card">
          <Text size="xl" fw={700}>{acceptRate}%</Text>
          <Text size="xs" c="dimmed">{t('Accept Rate')}</Text>
        </Card>
      </SimpleGrid>

      <StatusBreakdown stats={stats} />

      <Card withBorder p="lg" className="hydro-content-card">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <div>
              <Title order={3} size="h4">{t('Submission Statistics')}</Title>
              <Text size="sm" c="dimmed">{rscount} {t('submissions')}</Text>
            </div>
            <Group gap="xs">
              <Select
                aria-label={t('Sort')}
                size="xs"
                w={140}
                value={sort}
                data={types.map((type: string) => ({ value: type, label: statLabel(type, t) }))}
                onChange={(value) => updateQuery('sort', value)}
              />
              <Select
                aria-label={t('Direction')}
                size="xs"
                w={120}
                value={direction}
                data={[
                  { value: '1', label: 'ASC' },
                  { value: '-1', label: 'DESC' },
                ]}
                onChange={(value) => updateQuery('direction', value)}
              />
            </Group>
          </Group>

          <DataTable
            columns={columns}
            data={rsdocs}
            emptyMessage={t('Oh, there is no submission!')}
          />
          <Paginator page={page} totalPages={pcount} />
        </Stack>
      </Card>
    </Stack>
  );
}
