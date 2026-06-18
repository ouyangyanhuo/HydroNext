import { formatErrorMessage } from '@/utils/error';
import { Button, Group, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function HomeworkEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const tdoc = args.tdoc || {};
  const isNew = !tdoc.docId;
  const [form, setForm] = useState({ title: tdoc.title || '', content: tdoc.content || '', beginAt: tdoc.beginAt ? new Date(tdoc.beginAt).toISOString().slice(0, 16) : '', endAt: tdoc.endAt ? new Date(tdoc.endAt).toISOString().slice(0, 16) : '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else navigate(isNew ? '/h' : `/h/${tdoc.docId}`);
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={isNew ? t('Create Homework') : t('Edit Homework')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <TextInput label={t('Title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
          <TextInput label={t('Begin Time')} type="datetime-local" value={form.beginAt} onChange={(e) => setForm({ ...form, beginAt: e.currentTarget.value })} />
          <TextInput label={t('End Time')} type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.currentTarget.value })} />
          <Textarea label={t('Content (Markdown)')} value={form.content} onChange={(e) => setForm({ ...form, content: e.currentTarget.value })} minRows={6} autosize />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Save')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
