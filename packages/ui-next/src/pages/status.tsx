import { Badge, Paper, Stack, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function StatusPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const judges = args.judges || [];
  const uptime = args.uptime;

  return (
    <Stack gap="lg">
      <PageHeader title={t('Service Status')} />
      {uptime && <Text size="sm" c="dimmed">{t('Uptime')}: {uptime}</Text>}
      <Paper withBorder>
        <Table striped>
          <Table.Thead>
            <Table.Tr><Table.Th>{t('Judge')}</Table.Th><Table.Th>{t('Status')}</Table.Th><Table.Th>{t('Tasks')}</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {judges.length === 0 ? (
              <Table.Tr><Table.Td colSpan={3}><Text c="dimmed" ta="center">{t('No judges connected')}</Text></Table.Td></Table.Tr>
            ) : (
              judges.map((j: any, i: number) => (
                <Table.Tr key={i}>
                  <Table.Td><Text size="sm">{j.name || `Judge ${i + 1}`}</Text></Table.Td>
                  <Table.Td><Badge size="xs" color="green">{t('Online')}</Badge></Table.Td>
                  <Table.Td><Text size="sm">{j.tasks || 0}</Text></Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
