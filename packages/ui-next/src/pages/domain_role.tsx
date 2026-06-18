import { Badge, Paper, Stack, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainRolePage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const roles = args.roles || {};

  return (
    <Stack gap="lg">
      <PageHeader title={t('Roles')} />
      <Paper withBorder>
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>{t('Role')}</Table.Th><Table.Th>{t('Permissions')}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {Object.entries(roles).map(([name, perms]: [string, any]) => (
              <Table.Tr key={name}><Table.Td><Badge>{name}</Badge></Table.Td><Table.Td><Text size="xs" c="dimmed">{typeof perms === 'string' ? perms : JSON.stringify(perms).slice(0, 80)}</Text></Table.Td></Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
