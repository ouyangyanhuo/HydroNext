import { Paper, Table, Text, Stack, Group, Button } from '@mantine/core';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { EmptyState } from '@/components/common/empty-state';

export default function HomeFilesPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const udocs = args.udocs || [];

    return (
        <Stack gap="lg">
            <PageHeader title={t('My Files')} />
            {udocs.length === 0 ? (
                <EmptyState message={t('No files')} />
            ) : (
                <Paper withBorder>
                    <Table striped>
                        <Table.Thead>
                            <Table.Tr><Table.Th>{t('Name')}</Table.Th><Table.Th>{t('Size')}</Table.Th><Table.Th>{t('Date')}</Table.Th></Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {udocs.map((f: any) => (
                                <Table.Tr key={f._id}>
                                    <Table.Td><Text size="sm">{f.filename || f.name}</Text></Table.Td>
                                    <Table.Td><Text size="xs" c="dimmed">{Math.round((f.length || f.size || 0) / 1024)}KB</Text></Table.Td>
                                    <Table.Td><TimeDisplay date={f.uploadDate || f._id} format="relative" /></Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Paper>
            )}
        </Stack>
    );
}
