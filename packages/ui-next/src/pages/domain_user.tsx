import { Avatar, Badge, Group, Paper, Stack, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainUserPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const dudocs = args.dudocs || [];
  const udict = args.udict || {};
  const page = args.page || 1;
  const dpcount = args.dpcount || 1;
  const roles = args.roles || {};

  return (
    <Stack gap="lg">
      <PageHeader title={t('Domain Users')} />
      <Paper withBorder>
        <Table striped>
          <Table.Thead>
            <Table.Tr><Table.Th>#</Table.Th><Table.Th>{t('User')}</Table.Th><Table.Th>{t('Role')}</Table.Th><Table.Th>{t('Joined')}</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {dudocs.map((du: any, i: number) => {
              const u = udict[du.uid] || {};
              return (
                <Table.Tr key={du.uid}>
                  <Table.Td>{(page - 1) * 50 + i + 1}</Table.Td>
                  <Table.Td><Group gap="xs"><Avatar src={u.avatar} size="xs" radius="xl" /><Link to="user_detail" params={{ uid: du.uid }} className="no-underline hover:underline"><Text size="sm">{u.uname || du.uid}</Text></Link></Group></Table.Td>
                  <Table.Td><Badge size="xs">{roles[du.role] || du.role}</Badge></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{du.joinAt ? new Date(du.joinAt).toLocaleDateString() : '-'}</Text></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
      <Paginator page={page} totalPages={dpcount} />
    </Stack>
  );
}
