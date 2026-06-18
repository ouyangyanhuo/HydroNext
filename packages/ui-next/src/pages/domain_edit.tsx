import { Button, Group, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  
  const ddoc = args.ddoc || {};
  const [form, setForm] = useState({ name: ddoc.name || '', avatar: ddoc.avatar || '', bulletin: ddoc.bulletin || '', host: Array.isArray(ddoc.host) ? ddoc.host.join(', ') : (ddoc.host || '') });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const body = { ...form, host: form.host.split(',').map((s) => s.trim()).filter(Boolean) };
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Save failed');
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Domain Settings')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <TextInput label={t('Name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          <TextInput label={t('Avatar URL')} value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.currentTarget.value })} />
          <Textarea label={t('Bulletin')} value={form.bulletin} onChange={(e) => setForm({ ...form, bulletin: e.currentTarget.value })} minRows={3} />
          <TextInput label={t('Host')} value={form.host} onChange={(e) => setForm({ ...form, host: e.currentTarget.value })} placeholder="example.com" />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Save')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
