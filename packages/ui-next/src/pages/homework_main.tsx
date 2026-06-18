import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function HomeworkMainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const hdocs = args.hdocs || [];
  const page = args.page || 1;
  const hpcount = args.hpcount || 1;
  const tsdict = args.tsdict || {};

  return (
    <Stack gap="lg">
      <PageHeader title={t('Homework')} />
      {hdocs.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">{t('No homework')}</Text>
      ) : (
        <Stack gap="xs">
          {hdocs.map((h: any) => {
            const now = Date.now();
            const endAt = new Date(h.endAt).getTime();
            const isFinished = now >= endAt;
            return (
              <Paper key={h.docId} withBorder p="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Group gap="xs" mb={4}>
                      <Badge size="xs" variant="light" color={isFinished ? 'gray' : 'green'}>
                        {isFinished ? t('Finished') : t('Open')}
                      </Badge>
                    </Group>
                    <Link to="homework_detail" params={{ hid: h.docId }} className="no-underline hover:underline">
                      <Text fw={500}>{h.title}</Text>
                    </Link>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t('Due')}: <TimeDisplay date={h.endAt} format="absolute" />
                    </Text>
                  </div>
                  {tsdict[h.docId]?.score !== undefined && (
                    <Badge variant="light">{tsdict[h.docId].score}</Badge>
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}
      <Paginator page={page} totalPages={hpcount} />
    </Stack>
  );
}
