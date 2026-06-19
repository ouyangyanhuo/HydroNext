import { Badge, Card, Code, Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from '@/components/link';
import { CodeReplay } from '@/components/record/code-replay';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { STATUS } from '@/components/record/status-map';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useRecordSocket } from '@/hooks/use-record-socket';

function CaseResult({ c, index }: { c: any, index: number }) {
  return (
    <Group justify="space-between" p="sm" className="border-b border-[var(--hydro-border)] last:border-b-0">
      <Group gap="sm">
        <Text size="xs" fw={700} c="dimmed">#{index + 1}</Text>
        <RecordStatusBadge status={c.status} size="xs" />
      </Group>
      <Group gap="md">
        {c.time != null && (
          <Text size="xs" c="dimmed">{c.time}ms</Text>
        )}
        {c.memory != null && (
          <Text size="xs" c="dimmed">{Math.round(c.memory / 1024)}MB</Text>
        )}
      </Group>
    </Group>
  );
}

function Metric({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="min-w-24 rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface-tint)] px-3 py-2">
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{label}</Text>
      <Text size="sm" fw={700} className="truncate text-[var(--hydro-text)]">{value}</Text>
    </div>
  );
}

function InfoRow({ label, children }: { label: string, children: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-start" gap="md" className="border-b border-[var(--hydro-border)] py-2 last:border-b-0">
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{label}</Text>
      <div className="min-w-0 text-right">{children}</div>
    </Group>
  );
}

function OutputBlock({ title, content }: { title: string, content: string }) {
  return (
    <Card withBorder p="lg" className="hydro-content-card">
      <Stack gap="sm">
        <Text size="sm" fw={700}>{title}</Text>
        <div className="overflow-x-auto rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-bg-soft)]">
          <Code block className="min-w-max bg-transparent p-3">{content}</Code>
        </div>
      </Stack>
    </Card>
  );
}

export default function RecordDetailPage() {
  const { args } = usePageData();
  const { t } = useI18n();

  // Merge server-side data with real-time WebSocket updates
  const serverRdoc = args.rdoc || {};
  const wsUpdate = useRecordSocket(serverRdoc._id);
  const rdoc = wsUpdate ? { ...serverRdoc, ...wsUpdate } : serverRdoc;
  const udoc = args.udoc || {};
  const pdoc = args.pdoc || {};
  const tdoc = args.tdoc;

  const cases = rdoc.cases || rdoc.judge?.subtasks || [];
  const isJudging = rdoc.status === STATUS.STATUS_JUDGING || rdoc.status === STATUS.STATUS_COMPILING || rdoc.status === STATUS.STATUS_FETCHED;
  const recordId = String(rdoc._id || '').slice(-6);
  const scoreColor = rdoc.score === 100 ? 'green' : rdoc.score ? 'yellow' : 'gray';

  return (
    <Stack gap="lg">
      <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
        <Badge variant="light" color="hydroTeal" mb="sm">
          {t('Record')}
        </Badge>
        <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
          <div className="min-w-0">
            <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)] md:text-4xl">
              #{recordId || '-'}
            </Title>
            <Text size="sm" c="dimmed" mt="xs" className="truncate">
              {pdoc.pid || pdoc.docId ? `${pdoc.pid || pdoc.docId}. ${pdoc.title || ''}` : t('Submission detail')}
            </Text>
          </div>
          <Group gap="sm">
            <RecordStatusBadge status={rdoc.status} size="lg" />
            {rdoc.score != null && (
              <Badge variant="light" color={scoreColor} size="lg">
                {rdoc.score}
              </Badge>
            )}
          </Group>
        </Group>
        <Group gap="sm" mt="lg" wrap="wrap">
          {rdoc.time != null && <Metric label={t('Time')} value={`${rdoc.time}ms`} />}
          {rdoc.memory != null && <Metric label={t('Memory')} value={`${Math.round(rdoc.memory / 1024)}MB`} />}
          {rdoc.lang && <Metric label={t('Language')} value={rdoc.lang} />}
        </Group>
        {isJudging && (
          <Text c="blue" size="sm" mt="md" fw={600}>
            {t('Judging...')}
          </Text>
        )}
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Stack gap="md">
            {cases.length > 0 && (
              <Card withBorder p={0} className="hydro-content-card overflow-hidden">
                <Group justify="space-between" p="lg">
                  <Text size="sm" fw={700}>{t('Test Cases')}</Text>
                  <Badge variant="light">{cases.length}</Badge>
                </Group>
                <div className="border-t border-[var(--hydro-border)]">
                  {cases.map((c: any, i: number) => (
                    <CaseResult key={i} c={c} index={i} />
                  ))}
                </div>
              </Card>
            )}

            {rdoc.compilerText && (
              <OutputBlock title={t('Compiler Output')} content={rdoc.compilerText} />
            )}

            {rdoc.judgeText && (
              <OutputBlock title={t('Judge Message')} content={rdoc.judgeText} />
            )}

            {rdoc.code && (
              <Card withBorder p="lg" className="hydro-content-card">
                <Stack gap="sm">
                  <Text size="sm" fw={700}>{t('Source Code')}</Text>
                  <div className="overflow-x-auto rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-bg-soft)]">
                    <Code block className="min-w-max bg-transparent p-3">{rdoc.code}</Code>
                  </div>
                </Stack>
              </Card>
            )}

            {rdoc.replay && rdoc.replay.length > 0 && (
              <Card withBorder p="lg" className="hydro-content-card">
                <Stack gap="sm">
                  <Text size="sm" fw={700}>{t('Code Replay')}</Text>
                  <CodeReplay events={rdoc.replay} initialCode="" language={rdoc.lang} />
                </Stack>
              </Card>
            )}
          </Stack>
        </div>

        <div className="w-full shrink-0 lg:w-72">
          <Card withBorder p="md" className="hydro-panel">
            <Stack gap={0}>
              <InfoRow label={t('User')}>
                <UserLink user={udoc} size="xs" />
              </InfoRow>
              <InfoRow label={t('Problem')}>
                <Link to="problem_detail" params={{ pid: pdoc.pid || pdoc.docId }} className="block max-w-40 truncate text-xs no-underline hover:underline">
                  {pdoc.pid || pdoc.docId}. {pdoc.title}
                </Link>
              </InfoRow>
              <InfoRow label={t('Language')}>
                <Text size="xs">{rdoc.lang || '-'}</Text>
              </InfoRow>
              {tdoc && (
                <InfoRow label={t('Contest')}>
                  <Link to="contest_detail" params={{ tid: tdoc._id }} className="block max-w-40 truncate text-xs no-underline hover:underline">
                    {tdoc.title}
                  </Link>
                </InfoRow>
              )}
            </Stack>
          </Card>
        </div>
      </div>
    </Stack>
  );
}
