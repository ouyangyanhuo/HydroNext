import { Paper, Title, Table, Text, Group, Badge, Stack } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ContestScoreboardPage() {
    const { args } = usePageData();
    const { t } = useI18n();

    const rows = args.rows || [];
    const columns = args.columns || [];
    const tdoc = args.tdoc || {};

    return (
        <Stack gap="lg">
            <Title order={2}>{t('Scoreboard')} - {tdoc.title}</Title>

            <Paper withBorder p="lg" className="overflow-x-auto">
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>#</Table.Th>
                            <Table.Th>{t('User')}</Table.Th>
                            <Table.Th>{t('Score')}</Table.Th>
                            {columns.map((col: any, i: number) => (
                                <Table.Th key={i} ta="center">
                                    {col.title || String.fromCharCode(65 + i)}
                                </Table.Th>
                            ))}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map((row: any, rank: number) => (
                            <Table.Tr key={row.uid || rank}>
                                <Table.Td>{rank + 1}</Table.Td>
                                <Table.Td>
                                    <Link to="user_detail" params={{ uid: row.uid }} className="no-underline hover:underline">
                                        <Text size="sm">{row.uname || row.uid}</Text>
                                    </Link>
                                </Table.Td>
                                <Table.Td>
                                    <Badge variant="light">{row.score ?? 0}</Badge>
                                </Table.Td>
                                {columns.map((col: any, i: number) => {
                                    const cell = row.cells?.[i] || {};
                                    return (
                                        <Table.Td key={i} ta="center">
                                            {cell.score != null ? (
                                                <Badge size="xs" variant="light" color={cell.score === col.fullScore ? 'green' : 'yellow'}>
                                                    {cell.score}
                                                </Badge>
                                            ) : (
                                                <Text size="xs" c="dimmed">-</Text>
                                            )}
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
