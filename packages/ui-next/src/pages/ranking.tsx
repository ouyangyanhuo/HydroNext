import { Avatar, Group, Paper, Stack, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function RankingPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const ulist = args.ulist || [];
  const page = args.page || 1;
  const upcount = args.upcount || 1;

  return (
    <Stack gap="lg">
      <PageHeader title={t('Ranking')} />
      <Paper withBorder>
        <Table striped>
          <Table.Thead>
            <Table.Tr><Table.Th>#</Table.Th><Table.Th>{t('User')}</Table.Th><Table.Th>{t('Rating')}</Table.Th><Table.Th>{t('Accepted')}</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {ulist.map((u: any, i: number) => (
              <Table.Tr key={u._id}>
                <Table.Td>{(page - 1) * 100 + i + 1}</Table.Td>
                <Table.Td>
                  <Link to="user_detail" params={{ uid: u._id }} className="no-underline hover:underline">
                    <Group gap="xs"><Avatar src={u.avatar} size="xs" radius="xl" /><Text size="sm">{u.uname}</Text></Group>
                  </Link>
                </Table.Td>
                <Table.Td><Text size="sm">{u.rating || '-'}</Text></Table.Td>
                <Table.Td><Text size="sm">{u.nAccept || 0}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Paginator page={page} totalPages={upcount} />
    </Stack>
  );
}
