import { Paper, Stack, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainGroupPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const groups = args.groups || [];

  return (
    <Stack gap="lg">
      <PageHeader title={t('Groups')} />
      <Paper withBorder>
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>{t('Group')}</Table.Th><Table.Th>{t('Users')}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {groups.map((g: any) => (
              <Table.Tr key={g.name}><Table.Td><Text size="sm">{g.name}</Text></Table.Td><Table.Td><Text size="xs" c="dimmed">{g.uids?.length || 0}</Text></Table.Td></Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
