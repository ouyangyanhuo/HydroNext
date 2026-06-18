import { getAvatarUrl } from '@/utils/avatar';
import { Avatar, Group, Paper, Stack, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ContestUserPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const tdoc = args.tdoc || {};
  const udict = args.udict || {};
  const tsdocs = args.tsdocs || [];

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Participants')} - ${tdoc.title}`} />
      <Paper withBorder>
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>{t('User')}</Table.Th><Table.Th>{t('Score')}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {tsdocs.map((ts: any, i: number) => {
              const u = udict[ts.uid] || {};
              return (
                <Table.Tr key={ts.uid}>
                  <Table.Td>{i + 1}</Table.Td>
                  <Table.Td><Group gap="xs"><Avatar src={getAvatarUrl(u.avatar)} size="xs" radius="xl" /><Link to="user_detail" params={{ uid: ts.uid }} className="no-underline hover:underline"><Text size="sm">{u.uname || ts.uid}</Text></Link></Group></Table.Td>
                  <Table.Td><Text size="sm">{ts.score ?? '-'}</Text></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
