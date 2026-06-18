import { Button, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemConfigPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const pdoc = args.pdoc || {};
  const [config, setConfig] = useState(args.config || pdoc.config || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ config }) });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Save failed');
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Config')} - ${pdoc.pid}. ${pdoc.title}`}>
        <Button onClick={handleSave} loading={loading} size="xs">{t('Save')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Textarea value={config} onChange={(e) => setConfig(e.currentTarget.value)} minRows={15} autosize styles={{ input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '13px' } }} />
      </Paper>
    </Stack>
  );
}
