import { Button, Group, Paper, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function DiscussionCreatePage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const nodes = args.nodes || [];
  const [form, setForm] = useState({ title: '', content: '', node: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Failed');
      else navigate(data.redirect || '/discuss');
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Create Discussion')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <TextInput label={t('Title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
          <Select label={t('Node')} data={nodes.map((n: any) => ({ value: n._id || n.name, label: n.name }))} value={form.node} onChange={(v) => setForm({ ...form, node: v || '' })} searchable clearable />
          <Textarea label={t('Content (Markdown)')} value={form.content} onChange={(e) => setForm({ ...form, content: e.currentTarget.value })} minRows={10} autosize required />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Create')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
