import { Paper, Title, Stack, Text, Group, Badge, Button } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';

export default function TrainingDetailPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const tdoc = args.tdoc || {};
    const sections = tdoc.sections || [];
    const psdict = args.psdict || {};

    return (
        <Stack gap="lg">
            <Title order={2}>{tdoc.title}</Title>
            {tdoc.description && <MarkdownRenderer content={tdoc.description} />}
            {sections.map((sec: any, si: number) => (
                <Paper key={si} withBorder p="lg">
                    <Title order={3} mb="sm">{sec.title || `${t('Section')} ${si + 1}`}</Title>
                    {sec.description && <Text size="sm" c="dimmed" mb="md">{sec.description}</Text>}
                    <Stack gap="xs">
                        {(sec.pids || []).map((pid: any, pi: number) => (
                            <Group key={pi} justify="space-between">
                                <Link to="problem_detail" params={{ pid }} className="no-underline hover:underline">
                                    <Text size="sm">{String.fromCharCode(65 + pi)}. {psdict[pid]?.title || pid}</Text>
                                </Link>
                            </Group>
                        ))}
                    </Stack>
                </Paper>
            ))}
        </Stack>
    );
}
