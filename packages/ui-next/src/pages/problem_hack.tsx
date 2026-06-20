import { formatErrorMessage } from '@/utils/error';
import { Button, Group, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { CodeEditor } from '@/components/editor/code-editor';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemHackPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const langs = args.langs || {};
  const [lang, setLang] = useState('');
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const langOptions = Object.entries(langs).map(([id, info]: [string, any]) => ({ value: id, label: info.display || info.name || id }));

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ lang, code, input }),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Hack failed')));
      else if (data.redirect) navigate(data.redirect);
      else if (data.rid) navigate(`/record/${data.rid}`);
      else navigate(window.location.pathname.replace('/hack', ''));
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <Title order={2}>{t('Hack')} - {pdoc.pid}. {pdoc.title}</Title>
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <Select label={t('Language')} data={langOptions} value={lang} onChange={(v) => setLang(v || '')} searchable />
          <CodeEditor value={code} onChange={setCode} language={lang} height={300} />
          <Textarea label={t('Hack Input')} value={input} onChange={(e) => setInput(e.currentTarget.value)} minRows={5} autosize />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Submit Hack')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
