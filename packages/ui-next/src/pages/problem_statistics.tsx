import { Button, Card, Group, Progress, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconChartBar, IconCircleCheck, IconSend } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { STATUS } from '@/components/record/status-map';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
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
    const time = Number.parseInt(text.slice(0, 8), 16) * 1000;
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

function statRecordStatus(record: any) {
  if (record.status != null) return Number(record.status);
  if (record.rdoc?.status != null) return Number(record.rdoc.status);
  return STATUS.STATUS_ACCEPTED;
}

function StatusBreakdown({ stats }: { stats: Record<string, number> }) {
  const { t } = useI18n();
  const colors: Record<string, string> = {
    AC: 'green', WA: 'red', TLE: 'orange', MLE: 'yellow', RE: 'pink', CE: 'grape',
  };
  const items = ['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE']
    .map((key) => ({ key, value: stats?.[key] || 0, color: colors[key] }))
    .filter((item) => item.value > 0);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (!total) return null;

  return (
    <Card withBorder p="lg" className="hydro-content-card hydro-problem-statistics__distribution">
      <Stack gap="md">
        <Title order={3} size="h4">{t('Status Distribution')}</Title>
        <Stack gap="sm">
          {items.map((item) => (
            <div key={item.key}>
              <Group justify="space-between" mb={4}>
                <Text size="xs" fw={700}>{item.key}</Text>
                <Text size="xs" c="dimmed">{item.value}</Text>
              </Group>
              <Progress value={(item.value / total) * 100} size="sm" radius="xl" color={item.color} />
            </div>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function MetricCard({ icon, value, label, tone }: {
  icon: ReactNode;
  value: string | number;
  label: string;
  tone: 'primary' | 'success' | 'neutral';
}) {
  return (
    <Card withBorder className="hydro-problem-statistics__metric" data-tone={tone}>
      <span className="hydro-problem-statistics__metric-icon" aria-hidden="true">{icon}</span>
      <div>
        <Text className="hydro-problem-statistics__metric-value">{value}</Text>
        <Text className="hydro-problem-statistics__metric-label">{label}</Text>
      </div>
    </Card>
  );
}

export default function ProblemStatisticsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
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
  const problemName = [pdoc.pid || pdoc.docId, pdoc.title].filter(Boolean).join(' · ');

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
          <RecordStatusBadge status={statRecordStatus(r)} size="xs" />
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
    <Stack gap="lg" className="hydro-problem-statistics">
      <PageHeader title={`${t('Statistics')}${problemName ? ` · ${problemName}` : ''}`}>
        <Button component="a" href={buildUrl('problem_detail', { pid: pdoc.pid || pdoc.docId })} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
      </PageHeader>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className="hydro-problem-statistics__metrics">
        <MetricCard icon={<IconSend size={22} stroke={1.8} />} value={submitted} label={t('Total Submissions')} tone="primary" />
        <MetricCard icon={<IconCircleCheck size={22} stroke={1.8} />} value={accepted} label={t('Accepted')} tone="success" />
        <MetricCard icon={<IconChartBar size={22} stroke={1.8} />} value={`${acceptRate}%`} label={t('Accept Rate')} tone="neutral" />
      </SimpleGrid>

      <StatusBreakdown stats={stats} />

      <Card withBorder p="lg" className="hydro-content-card hydro-problem-statistics__records">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <div>
              <Title order={3} size="h4">{t('Submission Statistics')}</Title>
              <Text size="sm" c="dimmed">{rscount} {t('submissions')}</Text>
            </div>
            <Group gap="xs" className="hydro-problem-statistics__sorts">
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
                  { value: '1', label: t('Ascending') },
                  { value: '-1', label: t('Descending') },
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
