import { Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemStatisticsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const pdoc = args.pdoc || {};
  

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Statistics')} - ${pdoc.pid}. ${pdoc.title}`} />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Paper withBorder p="md" ta="center">
          <Text size="xl" fw={700}>{pdoc.nSubmit || 0}</Text>
          <Text size="xs" c="dimmed">{t('Total Submissions')}</Text>
        </Paper>
        <Paper withBorder p="md" ta="center">
          <Text size="xl" fw={700}>{pdoc.nAccept || 0}</Text>
          <Text size="xs" c="dimmed">{t('Accepted')}</Text>
        </Paper>
        <Paper withBorder p="md" ta="center">
          <Text size="xl" fw={700}>{pdoc.nSubmit ? Math.round((pdoc.nAccept || 0) / pdoc.nSubmit * 100) : 0}%</Text>
          <Text size="xs" c="dimmed">{t('Accept Rate')}</Text>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
