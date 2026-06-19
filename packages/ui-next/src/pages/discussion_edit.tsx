import { formatErrorMessage } from '@/utils/error';
import { Button, Card, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function DiscussionEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const ddoc = args.ddoc || {};
  const [form, setForm] = useState({ title: ddoc.title || '', content: ddoc.content || '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else navigate(`/discuss/${ddoc.docId}`);
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Edit Discussion')} />
      <Card withBorder p="lg" className="hydro-content-card">
        <Stack gap="md">
          {error && <Text c="red" size="sm">{error}</Text>}
          <TextInput label={t('Title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
          <Textarea label={t('Content (Markdown)')} value={form.content} onChange={(e) => setForm({ ...form, content: e.currentTarget.value })} minRows={10} autosize required />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Save')}</Button></Group>
        </Stack>
      </Card>
    </Stack>
  );
}
