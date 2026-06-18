import { Badge, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ContestScoreboardDownloadHtmlPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const rows = args.rows || [];
  const columns = args.columns || [];
  const tdoc = args.tdoc || {};

  return (
    <Stack gap="lg">
      <Title order={2}>{t('Scoreboard')} - {tdoc.title}</Title>
      <Paper withBorder p="lg" className="overflow-x-auto">
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>{t('User')}</Table.Th>
              <Table.Th>{t('Score')}</Table.Th>
              {columns.map((col: any, i: number) => (
                <Table.Th key={i} ta="center">{col.title || String.fromCharCode(65 + i)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row: any, rank: number) => (
              <Table.Tr key={row.uid || rank}>
                <Table.Td>{rank + 1}</Table.Td>
                <Table.Td><Text size="sm">{row.uname || row.uid}</Text></Table.Td>
                <Table.Td><Badge variant="light">{row.score ?? 0}</Badge></Table.Td>
                {columns.map((col: any, i: number) => {
                  const cell = row.cells?.[i] || {};
                  return (
                    <Table.Td key={i} ta="center">
                      {cell.score != null ? <Badge size="xs" variant="light">{cell.score}</Badge> : <Text size="xs" c="dimmed">-</Text>}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
