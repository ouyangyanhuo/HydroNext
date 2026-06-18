import { Badge, Code, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { STATUS } from '@/components/record/status-map';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

function CaseResult({ c, index }: { c: any, index: number }) {
  return (
    <Group justify="space-between" p="xs" className="border-b border-[var(--hydro-border)] last:border-b-0">
      <Group gap="sm">
        <Text size="xs" fw={500}>#{index + 1}</Text>
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

export default function RecordDetailPage() {
  const { args } = usePageData();
  const { t } = useI18n();

  const rdoc = args.rdoc || {};
  const udoc = args.udoc || {};
  const pdoc = args.pdoc || {};
  const tdoc = args.tdoc;

  const cases = rdoc.cases || rdoc.judge?.subtasks || [];
  const isJudging = rdoc.status === STATUS.STATUS_JUDGING || rdoc.status === STATUS.STATUS_COMPILING || rdoc.status === STATUS.STATUS_FETCHED;

  return (
    <Stack gap="lg">
      <Title order={2}>
        {t('Record')} #{String(rdoc._id).slice(-6)}
      </Title>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <Paper withBorder p="lg">
            <Group justify="space-between" mb="md">
              <Group gap="sm">
                <RecordStatusBadge status={rdoc.status} />
                {rdoc.score != null && (
                  <Badge variant="light" color={rdoc.score === 100 ? 'green' : 'yellow'}>
                    {rdoc.score}
                  </Badge>
                )}
              </Group>
              <Group gap="md">
                {rdoc.time != null && (
                  <Text size="sm" c="dimmed">{rdoc.time}ms</Text>
                )}
                {rdoc.memory != null && (
                  <Text size="sm" c="dimmed">{Math.round(rdoc.memory / 1024)}MB</Text>
                )}
              </Group>
            </Group>

            {isJudging && (
              <Text c="blue" size="sm" mb="md">
                {t('Judging...')}
              </Text>
            )}

            {cases.length > 0 && (
              <>
                <Text size="sm" fw={500} mb="xs">{t('Test Cases')}</Text>
                <Paper withBorder>
                  {cases.map((c: any, i: number) => (
                    <CaseResult key={i} c={c} index={i} />
                  ))}
                </Paper>
              </>
            )}

            {rdoc.compilerText && (
              <>
                <Divider my="md" />
                <Text size="sm" fw={500} mb="xs">{t('Compiler Output')}</Text>
                <Code block>{rdoc.compilerText}</Code>
              </>
            )}

            {rdoc.judgeText && (
              <>
                <Divider my="md" />
                <Text size="sm" fw={500} mb="xs">{t('Judge Message')}</Text>
                <Code block>{rdoc.judgeText}</Code>
              </>
            )}
          </Paper>

          {rdoc.code && (
            <Paper withBorder p="lg" mt="md">
              <Text size="sm" fw={500} mb="xs">{t('Source Code')}</Text>
              <Code block>{rdoc.code}</Code>
            </Paper>
          )}
        </div>

        <div className="w-full lg:w-64 shrink-0">
          <Stack gap="md">
            <Paper withBorder p="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">{t('User')}</Text>
                  <UserLink user={udoc} size="xs" />
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">{t('Problem')}</Text>
                  <Link to="problem_detail" params={{ pid: pdoc.pid || pdoc.docId }} className="text-xs no-underline hover:underline">
                    {pdoc.pid}. {pdoc.title}
                  </Link>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">{t('Language')}</Text>
                  <Text size="xs">{rdoc.lang || '-'}</Text>
                </Group>
                {tdoc && (
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">{t('Contest')}</Text>
                    <Link to="contest_detail" params={{ tid: tdoc._id }} className="text-xs no-underline hover:underline">
                      {tdoc.title}
                    </Link>
                  </Group>
                )}
              </Stack>
            </Paper>
          </Stack>
        </div>
      </div>
    </Stack>
  );
}
