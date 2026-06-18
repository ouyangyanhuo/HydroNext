import { useState, useCallback } from 'react';
import { Paper, Group, Button, Select, Stack, Text, Badge, Tabs, Divider } from '@mantine/core';
import { CodeEditor } from './code-editor';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { useI18n } from '@/hooks/use-i18n';
import { useNavigate } from '@/context/router';

interface ScratchpadProps {
  pid: string | number;
  langs: Record<string, any>;
  defaultCode?: string;
  defaultLang?: string;
  onSubmit?: (lang: string, code: string) => Promise<any>;
}

export function Scratchpad({
  pid,
  langs,
  defaultCode = '',
  defaultLang = '',
  onSubmit,
}: ScratchpadProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [lang, setLang] = useState(defaultLang);
  const [code, setCode] = useState(defaultCode);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const langOptions = Object.entries(langs).map(([id, info]: [string, any]) => ({
    value: id,
    label: info.display || info.name || id,
  }));

  const handleSubmit = useCallback(async () => {
    if (!lang) { setError(t('Please select a language')); return; }
    if (!code.trim()) { setError(t('Please enter your code')); return; }
    setSubmitting(true); setError(''); setResult(null);

    try {
      if (onSubmit) {
        const res = await onSubmit(lang, code);
        setResult(res);
      } else {
        const res = await fetch(`/p/${pid}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ lang, code }),
        });
        const data = await res.json();
        if (data.error) setError(data.error.message || 'Submission failed');
        else if (data.rid) navigate(`/record/${data.rid}`);
      }
    } catch { setError('Network error'); }
    finally { setSubmitting(false); }
  }, [lang, code, pid, onSubmit, t, navigate]);

  return (
    <Paper withBorder>
      <Stack gap={0}>
        {/* Toolbar */}
        <Group justify="space-between" p="xs" className="border-b border-[var(--hydro-border)]">
          <Group gap="xs">
            <Select
              data={langOptions}
              value={lang}
              onChange={(v) => setLang(v || '')}
              placeholder={t('Language')}
              searchable
              size="xs"
              w={160}
            />
          </Group>
          <Group gap="xs">
            <Button size="xs" onClick={handleSubmit} loading={submitting}>
              {t('Submit')}
            </Button>
          </Group>
        </Group>

        {/* Editor */}
        <CodeEditor
          value={code}
          onChange={setCode}
          language={lang}
          height={400}
        />

        {/* Result */}
        {(result || error) && (
          <>
            <Divider />
            <Paper p="xs" className="border-t border-[var(--hydro-border)]">
              {error ? (
                <Text c="red" size="sm">{error}</Text>
              ) : result ? (
                <Group gap="xs">
                  {result.status !== undefined && <RecordStatusBadge status={result.status} size="xs" />}
                  {result.score !== undefined && <Badge size="xs">{result.score}</Badge>}
                  {result.rid && (
                    <Button variant="subtle" size="xs" onClick={() => navigate(`/record/${result.rid}`)}>
                      {t('View Record')}
                    </Button>
                  )}
                </Group>
              ) : null}
            </Paper>
          </>
        )}
      </Stack>
    </Paper>
  );
}
