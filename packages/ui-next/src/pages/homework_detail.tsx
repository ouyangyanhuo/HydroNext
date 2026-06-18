import { Paper, Title, Stack, Text, Group, Badge, Button, SimpleGrid } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { TimeDisplay } from '@/components/common/time-display';
import { RecordStatusBadge } from '@/components/record/record-status-badge';

export default function HomeworkDetailPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const tdoc = args.tdoc || {};
    const psdict = args.psdict || {};
    const pdict = args.pdict || {};
    const tsdoc = args.tsdoc || {};

    return (
        <Stack gap="lg">
            <Title order={2}>{tdoc.title}</Title>
            <Paper withBorder p="md">
                <Group gap="md">
                    <Text size="sm" c="dimmed">{t('Due')}: <TimeDisplay date={tdoc.endAt} format="absolute" /></Text>
                    {tsdoc.score !== undefined && <Badge>{t('Score')}: {tsdoc.score}</Badge>}
                </Group>
            </Paper>
            {tdoc.content && <MarkdownRenderer content={tdoc.content} />}
            <Title order={3}>{t('Problems')}</Title>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {(tdoc.pdoc || []).map((p: any, i: number) => {
                    const psdoc = psdict[p.docId];
                    return (
                        <Paper key={p.docId || i} withBorder p="md">
                            <Group justify="space-between">
                                <Link to="problem_detail" params={{ pid: p.pid || p.docId }} className="no-underline hover:underline">
                                    <Text fw={500}>{String.fromCharCode(65 + i)}. {p.title}</Text>
                                </Link>
                                {psdoc?.status !== undefined && <RecordStatusBadge status={psdoc.status} size="xs" />}
                            </Group>
                        </Paper>
                    );
                })}
            </SimpleGrid>
        </Stack>
    );
}
