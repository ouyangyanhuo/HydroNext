import { Paper, Stack, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function TrainingMainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const tdocs = args.tdocs || [];
  const page = args.page || 1;
  const tpcount = args.tpcount || 1;

  return (
    <Stack gap="lg">
      <PageHeader title={t('Training')} />
      {tdocs.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">{t('No training')}</Text>
      ) : (
        <Stack gap="xs">
          {tdocs.map((tr: any) => (
            <Paper key={tr.docId} withBorder p="md">
              <Link to="training_detail" params={{ tid: tr.docId }} className="no-underline hover:underline">
                <Text fw={500}>{tr.title}</Text>
              </Link>
              <Text size="xs" c="dimmed" mt={4}>{tr.description || ''}</Text>
            </Paper>
          ))}
        </Stack>
      )}
      <Paginator page={page} totalPages={tpcount} />
    </Stack>
  );
}
