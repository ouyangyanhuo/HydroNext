import { Button, Group, Paper, Select, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useI18n } from '@/hooks/use-i18n';

export default function ManageUserImportPage() {
  const { t } = useI18n();
  const [data, setData] = useState('');
  const [format, setFormat] = useState('csv');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const handleImport = async () => {
    setLoading(true); setResult('');
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ data, format }) });
      const json = await res.json();
      if (json.error) setResult(`Error: ${json.error.message}`);
      else setResult(json.result || 'Import complete');
    } catch { setResult('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('User Import')} />
      <Paper withBorder p="lg">
        <Stack gap="md">
          <Select label={t('Format')} data={[{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }]} value={format} onChange={(v) => setFormat(v || 'csv')} />
          <Textarea label={t('Data')} value={data} onChange={(e) => setData(e.currentTarget.value)} minRows={10} autosize placeholder="username,password,email" />
          <Group justify="flex-end"><Button onClick={handleImport} loading={loading}>{t('Import')}</Button></Group>
          {result && <Text size="sm">{result}</Text>}
        </Stack>
      </Paper>
    </Stack>
  );
}
