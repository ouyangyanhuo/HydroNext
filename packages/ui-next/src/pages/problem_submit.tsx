import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { LongSelect } from '@/components/common/select';
import { CodeEditor } from '@/components/editor/code-editor';
import { getCodeTemplate } from '@/components/editor/code-templates';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

export default function ProblemSubmitPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();

  const pdoc = args.pdoc || {};
  const langs = args.langs || {};

  const user = useCurrentUser();
  const [lang, setLang] = useState(() => langs[user.codeLang] ? user.codeLang : Object.keys(langs)[0] || '');
  const [code, setCode] = useState(() => getCodeTemplate(lang, user.codeTemplate) || '');
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
      } else if (data.redirect) {
        navigate(data.redirect);
      } else if (data.rid) {
        navigate(buildUrl('record_detail', { rid: data.rid }));
      } else if (data.tid) {
        navigate(buildUrl('contest_problemlist', { tid: data.tid }));
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
          <LongSelect
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
