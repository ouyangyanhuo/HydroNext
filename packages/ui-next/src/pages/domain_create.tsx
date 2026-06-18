import { formatErrorMessage } from '@/utils/error';
import { Button, Group, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainCreatePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({ id: '', name: '', bulletin: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/domain/create', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else navigate(`/d/${form.id}`);
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Create Domain')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <TextInput label={t('Domain ID')} value={form.id} onChange={(e) => setForm({ ...form, id: e.currentTarget.value })} required />
          <TextInput label={t('Name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} required />
          <Textarea label={t('Bulletin')} value={form.bulletin} onChange={(e) => setForm({ ...form, bulletin: e.currentTarget.value })} minRows={3} />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Create')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
