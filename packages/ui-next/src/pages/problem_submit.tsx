import { Button, Group, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemSubmitPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();

  const pdoc = args.pdoc || {};
  const pdocConfig = args.pdoc?.config || {};
  const langs = args.langs || {};
  const prefix = args.prefix || '';

  const [lang, setLang] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const langOptions = Object.entries(langs).map(([id, info]: [string, any]) => ({
    value: id,
    label: info.display || info.name || id,
  }));

  const handleSubmit = async () => {
    if (!lang) {
      setError(t('Please select a language'));
      return;
    }
    if (!code.trim()) {
      setError(t('Please enter your code'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ lang, code }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error.message || 'Submission failed');
      } else if (data.rid) {
        navigate(`/record/${data.rid}`);
      } else {
        navigate(window.location.pathname.replace('/submit', ''));
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <Title order={2}>
        {t('Submit')} - {pdoc.pid}. {pdoc.title}
      </Title>

      {error && (
        <Text c="red" size="sm">{error}</Text>
      )}

      <Paper withBorder p="lg">
        <Stack gap="md">
          <Select
            label={t('Language')}
            data={langOptions}
            value={lang}
            onChange={(v) => setLang(v || '')}
            placeholder={t('Select language')}
            searchable
          />

          <Textarea
            label={t('Code')}
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            minRows={15}
            autosize
            maxRows={40}
            styles={{
              input: {
                fontFamily: 'var(--hydro-font-mono)',
                fontSize: '14px',
              },
            }}
          />

          <Group justify="flex-end">
            <Button onClick={handleSubmit} loading={loading}>
              {t('Submit')}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
