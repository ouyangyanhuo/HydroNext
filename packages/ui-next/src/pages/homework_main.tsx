import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentTime } from '@/hooks/use-time';

export default function HomeworkMainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const tdocs = args.tdocs || [];
  const page = args.page || 1;
  const tpcount = args.tpcount || 1;
  const now = useCurrentTime();

  return (
    <Stack gap="lg">
      <PageHeader title={t('Homework')} />
      {tdocs.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">{t('No homework')}</Text>
      ) : (
        <Stack gap="xs">
          {tdocs.map((tdoc: any) => {
            const beginAt = new Date(tdoc.beginAt).getTime();
            const penaltySince = new Date(tdoc.penaltySince || tdoc.endAt).getTime();
            const endAt = new Date(tdoc.endAt).getTime();
            const isUpcoming = now < beginAt;
            const isFinished = now >= endAt;
            const isExtended = !isFinished && now >= penaltySince;
            const dueAt = isExtended || isFinished ? tdoc.endAt : (tdoc.penaltySince || tdoc.endAt);
            return (
              <Paper key={tdoc.docId} withBorder p="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Group gap="xs" mb={4}>
                      <Badge size="xs" variant="light" color={isFinished ? 'gray' : isUpcoming ? 'blue' : isExtended ? 'yellow' : 'green'}>
                        {isFinished ? t('Finished') : isUpcoming ? t('Upcoming') : t('Open')}
                      </Badge>
                    </Group>
                    <Link to="homework_detail" params={{ tid: tdoc.docId }} className="no-underline hover:underline">
                      <Text fw={500}>{tdoc.title}</Text>
                    </Link>
                    <Text size="xs" c="dimmed" mt={4}>
                      {t('Due')}: <TimeDisplay date={dueAt} format="absolute" />
                    </Text>
                  </div>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}
      <Paginator page={page} totalPages={tpcount} />
    </Stack>
  );
}
