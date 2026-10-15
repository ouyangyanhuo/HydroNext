import {
  Badge,
  Card,
  Group,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconBolt,
  IconChartBar,
  IconCircleCheck,
  IconClock,
  IconCode,
  IconCpu,
  IconDatabase,
  IconLayersSubtract,
  IconMedal,
  IconSend,
  IconSortAscending,
  IconSortDescending,
  IconTag,
  IconTrophy,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { ShortSelect } from '@/components/common/select';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { STATUS } from '@/components/record/status-map';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';

const ALL_LANGUAGE = '__all__';

function formatMemory(memory?: number) {
  if (memory == null) return '-';
  if (memory < 1024) return `${memory} KB`;
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

function formatTimeLimit(pdoc: any) {
  const config = pdoc?.config || {};
  if (config.timeMin && config.timeMax && config.timeMin !== config.timeMax) return `${config.timeMin}~${config.timeMax}ms`;
  if (config.timeMax || config.timeMin) return `${config.timeMax || config.timeMin}ms`;
  if (pdoc?.limits?.time) return `${pdoc.limits.time}ms`;
  return '-';
}

function formatMemoryLimit(pdoc: any) {
  const config = pdoc?.config || {};
  if (config.memoryMin && config.memoryMax && config.memoryMin !== config.memoryMax) return `${config.memoryMin}~${config.memoryMax}MiB`;
  if (config.memoryMax || config.memoryMin) return `${config.memoryMax || config.memoryMin}MiB`;
  if (pdoc?.limits?.memory) return `${Math.round(pdoc.limits.memory / 1024)}MB`;
  return '-';
}

function getTimeLimitMs(pdoc: any): number | null {
  const ms = pdoc?.config?.timeMax || pdoc?.config?.timeMin || pdoc?.limits?.time;
  return ms ? Number(ms) : null;
}

function getMemoryLimitKB(pdoc: any): number | null {
  const memMiB = pdoc?.config?.memoryMax || pdoc?.config?.memoryMin;
  if (memMiB) return Number(memMiB) * 1024;
  if (pdoc?.limits?.memory) return Number(pdoc.limits.memory);
  return null;
}

function estimateDifficulty(problem: any) {
  if (problem?.difficulty !== undefined && problem?.difficulty !== null) return String(problem.difficulty);
  const submit = Number(problem?.nSubmit || 0);
  const accept = Number(problem?.nAccept || 0);
  if (!submit) return '-';
  const rate = accept / submit;
  if (rate >= 0.65) return '1';
  if (rate >= 0.45) return '2';
  if (rate >= 0.3) return '3';
  if (rate >= 0.15) return '4';
  return '5';
}

function statRecordStatus(record: any) {
  if (record.status != null) return Number(record.status);
  if (record.rdoc?.status != null) return Number(record.rdoc.status);
  return STATUS.STATUS_ACCEPTED;
}

function getScoreColor(score: number): string {
  const palette = [
    '#ef4444', '#f87171', '#fb923c', '#f97316', '#f59e0b',
    '#eab308', '#facc15', '#a3e635', '#84cc16', '#22c55e', '#16a34a',
  ];
  const idx = Math.min(10, Math.max(0, Math.floor(score / 10)));
  return palette[idx];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="hydro-rank-badge hydro-rank-badge--gold" title="Rank #1">
        <IconTrophy size={14} className="hydro-rank-badge__icon" />
        <span className="hydro-rank-badge__num">#1</span>
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="hydro-rank-badge hydro-rank-badge--silver" title="Rank #2">
        <IconMedal size={14} className="hydro-rank-badge__icon" />
        <span className="hydro-rank-badge__num">#2</span>
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="hydro-rank-badge hydro-rank-badge--bronze" title="Rank #3">
        <IconMedal size={14} className="hydro-rank-badge__icon" />
        <span className="hydro-rank-badge__num">#3</span>
      </span>
    );
  }
  return (
    <span className="hydro-rank-badge hydro-rank-badge--normal">
      #{rank}
    </span>
  );
}

function ProblemMetaStrip({ pdoc }: { pdoc: any }) {
  const { t } = useI18n();
  const typeKey = `problemType::${pdoc?.config?.type || 'default'}`;
  const typeLabel = t(typeKey) !== typeKey ? t(typeKey) : (pdoc?.config?.type || 'default');

  return (
    <div className="hydro-problem-statistics__meta-strip">
      <Group gap="lg" wrap="wrap" className="hydro-problem-statistics__meta-items">
        <Group gap={6} wrap="nowrap" className="hydro-problem-statistics__meta-item">
          <IconClock size={15} className="hydro-problem-statistics__meta-icon" />
          <Text size="xs" c="dimmed" fw={600}>{t('Time Limit')}:</Text>
          <Text size="xs" fw={700} c="var(--hydro-text)">{formatTimeLimit(pdoc)}</Text>
        </Group>
        <Group gap={6} wrap="nowrap" className="hydro-problem-statistics__meta-item">
          <IconDatabase size={15} className="hydro-problem-statistics__meta-icon" />
          <Text size="xs" c="dimmed" fw={600}>{t('Memory Limit')}:</Text>
          <Text size="xs" fw={700} c="var(--hydro-text)">{formatMemoryLimit(pdoc)}</Text>
        </Group>
        <Group gap={6} wrap="nowrap" className="hydro-problem-statistics__meta-item">
          <IconCpu size={15} className="hydro-problem-statistics__meta-icon" />
          <Text size="xs" c="dimmed" fw={600}>{t('Problem Type')}:</Text>
          <Text size="xs" fw={700} c="var(--hydro-text)">{typeLabel}</Text>
        </Group>
        <Group gap={6} wrap="nowrap" className="hydro-problem-statistics__meta-item">
          <IconLayersSubtract size={15} className="hydro-problem-statistics__meta-icon" />
          <Text size="xs" c="dimmed" fw={600}>{t('Difficulty')}:</Text>
          <Text size="xs" fw={700} c="var(--hydro-text)">{estimateDifficulty(pdoc)}</Text>
        </Group>
      </Group>
      {Array.isArray(pdoc?.tag) && pdoc.tag.length > 0 && (
        <Group gap={6} wrap="wrap" className="hydro-problem-statistics__tags">
          <IconTag size={13} className="hydro-problem-statistics__tag-icon" />
          {pdoc.tag.map((tag: string) => (
            <Badge key={tag} size="xs" variant="light" color="gray" radius="sm" className="hydro-problem-statistics__tag-badge">
              {tag}
            </Badge>
          ))}
        </Group>
      )}
    </div>
  );
}

function StatusBreakdown({ stats }: { stats: Record<string, number> }) {
  const { t } = useI18n();
  const statusConfig: Record<string, { color: string }> = {
    AC: { color: '#22c55e' },
    WA: { color: '#ef4444' },
    TLE: { color: '#f97316' },
    MLE: { color: '#eab308' },
    RE: { color: '#ec4899' },
    CE: { color: '#a855f7' },
    OLE: { color: '#06b6d4' },
  };
  const items = Object.keys(statusConfig)
    .map((key) => ({
      key,
      color: statusConfig[key].color,
      value: stats?.[key] || 0,
    }))
    .filter((item) => item.value > 0);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (!total) return null;

  return (
    <Card withBorder p="lg" className="hydro-content-card hydro-problem-statistics__distribution">
      <Stack gap="md">
        <Group justify="space-between" align="baseline">
          <Title order={3} size="h4">{t('Status Distribution')}</Title>
          <Text size="xs" c="dimmed">{total} {t('submissions')}</Text>
        </Group>
        <Progress.Root size={22} radius="md" className="hydro-problem-statistics__multi-progress">
          {items.map((item) => {
            const percent = (item.value / total) * 100;
            return (
              <Tooltip
                key={item.key}
                label={`${item.key}: ${item.value} (${percent.toFixed(1)}%)`}
                withArrow
              >
                <Progress.Section
                  value={percent}
                  color={item.color}
                  className="hydro-problem-statistics__progress-section"
                >
                  {percent >= 7 && (
                    <Progress.Label className="hydro-problem-statistics__progress-label">
                      {item.key}
                    </Progress.Label>
                  )}
                </Progress.Section>
              </Tooltip>
            );
          })}
        </Progress.Root>
        <div className="hydro-problem-statistics__legend-grid">
          {items.map((item) => {
            const percent = ((item.value / total) * 100).toFixed(1);
            return (
              <div key={item.key} className="hydro-problem-statistics__legend-chip">
                <span
                  className="hydro-problem-statistics__legend-dot"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="hydro-problem-statistics__legend-name">{item.key}</span>
                <span className="hydro-problem-statistics__legend-val">{item.value}</span>
                <span className="hydro-problem-statistics__legend-percent">{percent}%</span>
              </div>
            );
          })}
        </div>
      </Stack>
    </Card>
  );
}

function ScoreDistribution({ stats }: { stats: Record<string, number> }) {
  const { t } = useI18n();
  const scoreItems = Array.from({ length: 101 }, (_, i) => i)
    .map((score) => ({ score, count: Number(stats?.[`s${score}`]) || 0 }))
    .filter((item) => item.count > 0);

  const totalScored = scoreItems.reduce((sum, item) => sum + item.count, 0);
  if (scoreItems.length === 0 || !totalScored) return null;

  const maxCount = Math.max(...scoreItems.map((item) => item.count), 1);

  return (
    <Card withBorder p="lg" className="hydro-content-card hydro-problem-statistics__score-card">
      <Stack gap="md">
        <Group justify="space-between" align="baseline">
          <Title order={3} size="h4">{t('Score Distribution')}</Title>
          <Text size="xs" c="dimmed">{totalScored} {t('submissions')}</Text>
        </Group>
        <div className="hydro-problem-statistics__score-bars-container">
          <div className="hydro-problem-statistics__score-bars">
            {scoreItems.map((item) => {
              const heightPercent = Math.max(8, Math.round((item.count / maxCount) * 100));
              const percent = ((item.count / totalScored) * 100).toFixed(1);
              const barColor = getScoreColor(item.score);

              return (
                <Tooltip
                  key={item.score}
                  label={`${item.score} pts: ${item.count} (${percent}%)`}
                  withArrow
                >
                  <div className="hydro-problem-statistics__score-col">
                    <div className="hydro-problem-statistics__score-count">
                      {item.count}
                    </div>
                    <div className="hydro-problem-statistics__score-track">
                      <div
                        className="hydro-problem-statistics__score-bar"
                        style={{
                          height: `${heightPercent}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <div className="hydro-problem-statistics__score-label">
                      {item.score}
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
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
      <div className="hydro-problem-statistics__metric-body">
        <Text className="hydro-problem-statistics__metric-value" ta="center">{value}</Text>
        <Text className="hydro-problem-statistics__metric-label" ta="center">{label}</Text>
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
  const stats = pdoc.stats || {};
  const accepted = pdoc.nAccept || 0;
  const submitted = pdoc.nSubmit || 0;
  const acceptRate = submitted ? Math.round((accepted / submitted) * 100) : 0;
  const problemName = [pdoc.pid || pdoc.docId, pdoc.title].filter(Boolean).join(' · ');
  const currentLang = new URLSearchParams(window.location.search).get('lang') || ALL_LANGUAGE;
  const configuredLangs = (window as any).LANGS || {};
  const problemLangs = Array.isArray(pdoc.config?.langs)
    ? new Set(pdoc.config.langs.map(String))
    : null;

  const languageOptions = [
    { value: ALL_LANGUAGE, label: t('All Languages') },
    ...Object.entries<any>(configuredLangs)
      .filter(([id, info]) => !info?.hidden && !info?.disabled && (!problemLangs || problemLangs.has(id)))
      .map(([value, info]) => ({ value, label: info?.display || info?.name || value })),
  ];
  if (currentLang !== ALL_LANGUAGE && !languageOptions.some((option) => option.value === currentLang)) {
    languageOptions.push({ value: currentLang, label: configuredLangs[currentLang]?.display || currentLang });
  }

  const updateQuery = (key: string, value?: string | null) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  const updateSortMode = (newSort: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('sort', newSort);
    url.searchParams.set('direction', newSort === 'date' ? '-1' : '1');
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  const quickModeOptions = [
    {
      value: 'time',
      label: (
        <Group gap={5} wrap="nowrap" justify="center">
          <IconBolt size={14} />
          <span>{t('Fastest')}</span>
        </Group>
      ),
    },
    {
      value: 'memory',
      label: (
        <Group gap={5} wrap="nowrap" justify="center">
          <IconDatabase size={14} />
          <span>{t('Min Memory')}</span>
        </Group>
      ),
    },
    {
      value: 'length',
      label: (
        <Group gap={5} wrap="nowrap" justify="center">
          <IconCode size={14} />
          <span>{t('Shortest')}</span>
        </Group>
      ),
    },
    {
      value: 'date',
      label: (
        <Group gap={5} wrap="nowrap" justify="center">
          <IconClock size={14} />
          <span>{t('Latest')}</span>
        </Group>
      ),
    },
  ];

  const pageSize = (pcount > 1 && rscount > 0) ? Math.ceil(rscount / pcount) : (rsdocs.length || 20);
  const rankOffset = (page - 1) * pageSize;
  const rankedDocs = rsdocs.map((r: any, idx: number) => ({
    ...r,
    __rank: rankOffset + idx + 1,
  }));

  const timeLimitMs = getTimeLimitMs(pdoc);
  const memLimitKB = getMemoryLimitKB(pdoc);

  const columns = [
    {
      key: '__rank',
      title: '#',
      width: 68,
      align: 'center' as const,
      render: (r: any) => <RankBadge rank={r.__rank} />,
    },
    {
      key: 'status',
      title: t('Status'),
      width: 125,
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
      width: 125,
      align: 'right' as const,
      render: (r: any) => {
        if (r.time == null) return <Text size="xs" c="dimmed">-</Text>;
        const val = Math.round(r.time);
        const ratio = timeLimitMs ? Math.min(100, Math.max(4, Math.round((val / timeLimitMs) * 100))) : null;
        const tone = ratio == null ? 'normal' : ratio <= 40 ? 'low' : ratio <= 75 ? 'medium' : 'high';
        const tooltip = timeLimitMs
          ? `${val} ms / ${timeLimitMs} ms (${ratio}%)`
          : `${val} ms`;

        return (
          <Tooltip label={tooltip} withArrow openDelay={200}>
            <div className="hydro-usage-cell">
              <span className="hydro-usage-cell__value">{val} ms</span>
              {ratio != null && (
                <div className="hydro-usage-cell__track">
                  <div
                    className={`hydro-usage-cell__bar hydro-usage-cell__bar--${tone}`}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      key: 'memory',
      title: t('Memory'),
      width: 125,
      align: 'right' as const,
      render: (r: any) => {
        if (r.memory == null) return <Text size="xs" c="dimmed">-</Text>;
        const ratio = memLimitKB ? Math.min(100, Math.max(4, Math.round((r.memory / memLimitKB) * 100))) : null;
        const tone = ratio == null ? 'normal' : ratio <= 40 ? 'low' : ratio <= 75 ? 'medium' : 'high';
        const tooltip = memLimitKB
          ? `${formatMemory(r.memory)} / ${formatMemory(memLimitKB)} (${ratio}%)`
          : formatMemory(r.memory);

        return (
          <Tooltip label={tooltip} withArrow openDelay={200}>
            <div className="hydro-usage-cell">
              <span className="hydro-usage-cell__value">{formatMemory(r.memory)}</span>
              {ratio != null && (
                <div className="hydro-usage-cell__track">
                  <div
                    className={`hydro-usage-cell__bar hydro-usage-cell__bar--${tone}`}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      key: 'lang',
      title: t('Language'),
      width: 110,
      render: (r: any) => (
        <Text size="xs" c="dimmed">{configuredLangs[r.lang]?.display || configuredLangs[r.lang]?.name || r.lang || '-'}</Text>
      ),
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
      width: 160,
      render: (r: any) => <Text size="xs" c="dimmed">{formatSubmitAt(r.judgeAt || r._id)}</Text>,
    },
  ];

  const hasStatusData = ['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'OLE'].some((k) => (stats?.[k] || 0) > 0);
  const hasScoreData = Array.from({ length: 101 }, (_, i) => stats?.[`s${i}`]).some((v) => Number(v) > 0);

  return (
    <Stack gap="lg" className="hydro-problem-statistics">
      <PageHeader title={`${t('Statistics')}${problemName ? ` · ${problemName}` : ''}`}>
        <Button
          component="a"
          href={buildUrl('problem_detail', { pid: pdoc.pid || pdoc.docId })}
          variant="subtle"
          size="xs"
          leftSection={<IconArrowLeft size={14} />}
        >
          {t('Back')}
        </Button>
      </PageHeader>

      <ProblemMetaStrip pdoc={pdoc} />

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className="hydro-problem-statistics__metrics">
        <MetricCard icon={<IconSend size={22} stroke={1.8} />} value={submitted} label={t('Total Submissions')} tone="primary" />
        <MetricCard icon={<IconCircleCheck size={22} stroke={1.8} />} value={accepted} label={t('Accepted')} tone="success" />
        <MetricCard icon={<IconChartBar size={22} stroke={1.8} />} value={`${acceptRate}%`} label={t('Accept Rate')} tone="neutral" />
      </SimpleGrid>

      {hasStatusData && hasScoreData ? (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <StatusBreakdown stats={stats} />
          <ScoreDistribution stats={stats} />
        </SimpleGrid>
      ) : hasStatusData ? (
        <StatusBreakdown stats={stats} />
      ) : hasScoreData ? (
        <ScoreDistribution stats={stats} />
      ) : null}

      <Card withBorder p="lg" className="hydro-content-card hydro-problem-statistics__records">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <div>
              <Title order={3} size="h4">{t('Submission Statistics')}</Title>
              <Text size="sm" c="dimmed">{rscount} {t('submissions')}</Text>
            </div>
            <Group gap="xs" wrap="wrap" className="hydro-problem-statistics__controls">
              <SegmentedControl
                size="xs"
                value={['time', 'memory', 'length', 'date'].includes(sort) ? sort : undefined}
                onChange={(value) => updateSortMode(value)}
                data={quickModeOptions}
                className="hydro-problem-statistics__quick-modes"
              />
              <Tooltip label={direction === '1' ? t('Ascending') : t('Descending')} withArrow>
                <ActionIcon
                  variant="default"
                  size={30}
                  aria-label={t('Direction')}
                  onClick={() => updateQuery('direction', direction === '1' ? '-1' : '1')}
                  className="hydro-problem-statistics__direction-btn"
                >
                  {direction === '1' ? <IconSortAscending size={15} /> : <IconSortDescending size={15} />}
                </ActionIcon>
              </Tooltip>
              <ShortSelect
                aria-label={t('Language')}
                size="xs"
                w={150}
                searchable
                value={currentLang}
                data={languageOptions}
                onChange={(value) => updateQuery('lang', value === ALL_LANGUAGE ? null : value)}
              />
            </Group>
          </Group>

          <DataTable
            columns={columns}
            data={rankedDocs}
            emptyMessage={t('Oh, there is no submission!')}
          />
          <Paginator page={page} totalPages={pcount} />
        </Stack>
      </Card>
    </Stack>
  );
}
