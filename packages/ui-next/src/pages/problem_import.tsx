import { Button, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemImportPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({ type: 'hydro', url: '', pid: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/p/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Import failed');
      else navigate('/p');
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Import Problems')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <Select label={t('Source')} data={[{ value: 'hydro', label: 'Hydro' }, { value: 'vijos', label: 'Vijos' }, { value: 'hustoj', label: 'HUSTOJ' }, { value: 'qoj', label: 'QOJ' }]} value={form.type} onChange={(v) => setForm({ ...form, type: v || 'hydro' })} />
          <TextInput label={t('URL or ID')} value={form.url} onChange={(e) => setForm({ ...form, url: e.currentTarget.value })} placeholder="https://hydro.ac/p/1" />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Import')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
