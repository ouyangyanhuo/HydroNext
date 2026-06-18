import { Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useI18n } from '@/hooks/use-i18n';

export default function ManageUserPrivPage() {
  const { t } = useI18n();
  const [uid, setUid] = useState('');
  const [priv, setPriv] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ uid, priv }) });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Failed');
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('User Privileges')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <TextInput label={t('User ID')} value={uid} onChange={(e) => setUid(e.currentTarget.value)} required />
          <TextInput label={t('Privilege')} value={priv} onChange={(e) => setPriv(e.currentTarget.value)} placeholder="e.g. 0, +1, -1" />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Apply')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
