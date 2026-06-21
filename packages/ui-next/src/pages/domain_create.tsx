import { formatErrorMessage } from '@/utils/error';
import { Button, Card, Group, List, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainCreatePage() {
  const { t } = useI18n();
  const [form, setForm] = useState({ id: '', name: '', bulletin: '', avatar: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else window.location.href = `/d/${data.domainId || form.id}/`;
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Create Domain')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Card withBorder p="lg" className="hydro-content-card">
        <Stack gap="md">
          <Card withBorder p="md" bg="var(--hydro-surface-muted)">
            <Text size="sm" fw={600} mb="xs">{t('A domain ID cannot be changed after creation. It is supposed to be:')}</Text>
            <List size="sm" c="dimmed" spacing={4}>
              <List.Item>{t('Unique')}</List.Item>
              <List.Item>{t('At least 4 characters')}</List.Item>
              <List.Item>{t('Not wrapped with space')}</List.Item>
              <List.Item>{t('Not started with a number')}</List.Item>
              <List.Item>{t('Only A-Z, a-z, 0-9 and _ are accepted')}</List.Item>
            </List>
          </Card>
          <TextInput label={t('Domain ID')} value={form.id} onChange={(e) => setForm({ ...form, id: e.currentTarget.value })} required />
          <TextInput label={t('Name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} required />
          <Textarea label={t('Bulletin')} value={form.bulletin} onChange={(e) => setForm({ ...form, bulletin: e.currentTarget.value })} minRows={8} required />
          <TextInput label={t('Avatar')} value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.currentTarget.value })} placeholder="gravatar:user@example.com" />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => window.history.back()}>{t('Cancel')}</Button>
            <Button onClick={handleSubmit} loading={loading}>{t('Create')}</Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
