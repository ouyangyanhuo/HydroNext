import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentTime } from '@/hooks/use-time';
import { formatErrorMessage } from '@/utils/error';

export default function HomeworkDetailPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const isLoggedIn = useIsLoggedIn();
  const now = useCurrentTime();
  const [claiming, setClaiming] = useState(false);
  const tdoc = args.tdoc || {};
  const psdict = args.psdict || {};
  const tsdoc = args.tsdoc || {};
  const pdict = args.pdict || {};
  const pids = Array.isArray(tdoc.pids) ? tdoc.pids : [];
  const isFinished = now >= new Date(tdoc.endAt).getTime();

  const claimHomework = async () => {
    setClaiming(true);
    try {
      const response = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'attend' }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.error) throw new Error(formatErrorMessage(payload?.error, t('Operation failed')));
      window.location.reload();
    } catch (error: any) {
      notifications.show({
        title: t('Operation failed'),
        message: error?.message || t('Network error'),
        color: 'red',
      });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Stack gap="lg">
      <Title order={2}>{tdoc.title}</Title>
      <Paper withBorder p="md">
        <Group gap="md" justify="space-between">
          <Group gap="md">
            <Text size="sm" c="dimmed">{t('Due')}: <TimeDisplay date={tdoc.endAt} format="absolute" /></Text>
            {tsdoc.score !== undefined && <Badge>{t('Score')}: {tsdoc.score}</Badge>}
          </Group>
          {isLoggedIn && !tsdoc.attend && !isFinished && (
            <Button size="xs" loading={claiming} onClick={claimHomework}>{t('Claim Homework')}</Button>
          )}
        </Group>
      </Paper>
      {tdoc.content && <MarkdownRenderer content={tdoc.content} />}
      <Title order={3}>{t('Problems')}</Title>
      {pids.length > 0 && Object.keys(pdict).length > 0 ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {pids.map((pid: number, i: number) => {
            const pdoc = pdict[pid] || {};
            const psdoc = psdict[pid];
            const problemId = pdoc.pid || pdoc.docId || pid;
            const problemUrl = buildUrl('problem_detail', { pid: problemId }, tsdoc.attend ? { tid: String(tdoc.docId) } : {});
            return (
              <Paper key={pid || i} withBorder p="md">
                <Group justify="space-between">
                  <Link href={problemUrl} className="no-underline hover:underline">
                    <Text fw={500}>{String.fromCharCode(65 + i)}. {pdoc.title || pid}</Text>
                  </Link>
                  {psdoc?.status !== undefined && <RecordStatusBadge status={psdoc.status} size="xs" />}
                </Group>
              </Paper>
            );
          })}
        </SimpleGrid>
      ) : (
        <Paper withBorder p="xl">
          <Text c="dimmed" ta="center">
            {tsdoc.attend
              ? t('This homework is not open and you cannot view problems.')
              : t('Please claim the assignment to see the problems.')}
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
