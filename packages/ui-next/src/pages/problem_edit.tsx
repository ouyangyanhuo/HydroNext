import { Button, Group, Paper, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const isNew = !pdoc.docId;

  const [form, setForm] = useState({
    pid: pdoc.pid || '',
    title: pdoc.title || '',
    content: pdoc.content || '',
    tag: (pdoc.tag || []).join(', '),
    hidden: pdoc.hidden || false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const body: any = { ...form };
      body.tag &&= body.tag.split(',').map((s: string) => s.trim()).filter(Boolean);
      const url = isNew ? '/p/files' : window.location.href;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Save failed');
      else navigate(isNew ? '/p' : `/p/${pdoc.pid || pdoc.docId}/edit`);
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={isNew ? t('Create Problem') : t('Edit Problem')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <TextInput label={t('Problem ID')} value={form.pid} onChange={(e) => setForm({ ...form, pid: e.currentTarget.value })} />
          <TextInput label={t('Title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
          <MarkdownEditor value={form.content} onChange={(v) => setForm({ ...form, content: v })} minRows={12} />
          <TextInput label={t('Tags')} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.currentTarget.value })} placeholder="tag1, tag2" />
          <Switch label={t('Hidden')} checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.currentTarget.checked })} />
          <Group justify="flex-end">
            <Button onClick={handleSubmit} loading={loading}>{t('Save')}</Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
