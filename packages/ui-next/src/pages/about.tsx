import { Paper, Title, Stack, Text } from '@mantine/core';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';

export default function AboutPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const content = args.content || args.about || '';

    return (
        <Stack gap="lg">
            <Title order={2}>{t('About')}</Title>
            {content ? (
                <MarkdownRenderer content={content} />
            ) : (
                <Paper withBorder p="lg">
                    <Text c="dimmed">{t('No about page content configured.')}</Text>
                </Paper>
            )}
        </Stack>
    );
}
