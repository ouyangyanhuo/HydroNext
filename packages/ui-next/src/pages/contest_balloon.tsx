import { Badge, Paper, Stack, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ContestBalloonPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const tdoc = args.tdoc || {};
  const balloons = args.balloons || [];
  const udict = args.udict || {};

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Balloons')} - ${tdoc.title}`} />
      <Paper withBorder>
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>{t('User')}</Table.Th><Table.Th>{t('Problem')}</Table.Th><Table.Th>{t('Time')}</Table.Th><Table.Th>{t('Status')}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {balloons.map((b: any, i: number) => (
              <Table.Tr key={i}>
                <Table.Td><Text size="sm">{udict[b.uid]?.uname || b.uid}</Text></Table.Td>
                <Table.Td><Text size="sm">{b.pid}</Text></Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{b.time ? new Date(b.time).toLocaleTimeString() : '-'}</Text></Table.Td>
                <Table.Td><Badge size="xs" color={b.done ? 'green' : 'yellow'}>{b.done ? t('Done') : t('Pending')}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
