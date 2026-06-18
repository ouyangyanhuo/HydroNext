import { Button, Group, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

export default function HomeSettingsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const [form, setForm] = useState({
    uname: user.uname || '',
    bio: args.bio || '',
    gender: args.gender || '',
    school: args.school || '',
    grade: args.grade || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Save failed');
      else setSuccess(t('Settings saved'));
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Settings')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <TextInput label={t('Username')} value={form.uname} onChange={(e) => setForm({ ...form, uname: e.currentTarget.value })} />
          <Textarea label={t('Bio')} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.currentTarget.value })} minRows={3} />
          <TextInput label={t('School')} value={form.school} onChange={(e) => setForm({ ...form, school: e.currentTarget.value })} />
          <TextInput label={t('Grade')} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.currentTarget.value })} />
          <Group justify="flex-end">
            <Button onClick={handleSubmit} loading={loading}>{t('Save')}</Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
