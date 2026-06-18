import { Paper, Stack, Text, Title } from '@mantine/core';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

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
