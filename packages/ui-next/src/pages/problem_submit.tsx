import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Group, Select, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { CodeEditor } from '@/components/editor/code-editor';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemSubmitPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();

  const pdoc = args.pdoc || {};
  const langs = args.langs || {};

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
        setError(formatErrorMessage(data.error, t('Submission failed')));
      } else if (data.rid) {
        navigate(`/record/${data.rid}`);
      } else {
        navigate(window.location.pathname.replace('/submit', ''));
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
        <Badge variant="light" color="hydroTeal" mb="sm">
          {t('Submit')}
        </Badge>
        <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)] md:text-4xl">
          <span className="text-[var(--hydro-primary)]">{pdoc.pid || pdoc.docId}</span>
          {' '}
          {pdoc.title}
        </Title>
      </Card>

      <Card withBorder p="lg" className="hydro-content-card">
        <Stack gap="md">
          {error && <Text c="red" size="sm">{error}</Text>}
          <Select
            label={t('Language')}
            data={langOptions}
            value={lang}
            onChange={(v) => setLang(v || '')}
            placeholder={t('Select language')}
            searchable
          />

          <CodeEditor
            value={code}
            onChange={setCode}
            language={lang}
            height={500}
          />

          <Group justify="flex-end">
            <Button onClick={handleSubmit} loading={loading}>
              {t('Submit')}
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
