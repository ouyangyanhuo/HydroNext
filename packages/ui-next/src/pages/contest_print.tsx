import { Button, Group, Paper, Stack, Textarea } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ContestPrintPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const tdoc = args.tdoc || {};
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ content }) });
      setContent('');
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Print')} - ${tdoc.title}`} />
      <Paper withBorder p="lg">
        <Textarea label={t('Content')} value={content} onChange={(e) => setContent(e.currentTarget.value)} minRows={10} autosize mb="md" />
        <Group justify="flex-end"><Button onClick={handlePrint} loading={loading}>{t('Send to Printer')}</Button></Group>
      </Paper>
    </Stack>
  );
}
