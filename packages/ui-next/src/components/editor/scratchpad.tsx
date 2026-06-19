import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { Badge, Button, Divider, Group, Paper, Select, Stack, Tabs, Text, Textarea, Title } from '@mantine/core';
import { CodeEditor } from './code-editor';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { useI18n } from '@/hooks/use-i18n';
import { useNavigate } from '@/context/router';

interface ScratchpadProps {
  pid: string | number;
  langs: Record<string, any>;
  defaultCode?: string;
  defaultLang?: string;
  statement?: ReactNode;
  title?: string;
  onClose?: () => void;
  onSubmit?: (lang: string, code: string) => Promise<any>;
}

export function Scratchpad({
  pid,
  langs,
  defaultCode = '',
  defaultLang = '',
  statement,
  title,
  onClose,
  onSubmit,
}: ScratchpadProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const langOptions = useMemo(() => Object.entries(langs).map(([id, info]: [string, any]) => ({
    value: id,
    label: info.display || info.name || id,
  })), [langs]);
  const [lang, setLang] = useState(defaultLang || langOptions[0]?.value || '');
  const [code, setCode] = useState(defaultCode);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

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
          body: JSON.stringify({ lang, code, input: input ? [input] : [] }),
        });
        const data = await res.json();
        if (data.error) setError(data.error.message || 'Submission failed');
        else if (data.rid) navigate(`/record/${data.rid}`);
      }
    } catch { setError('Network error'); }
    finally { setSubmitting(false); }
  }, [lang, code, input, pid, onSubmit, t, navigate]);

  return (
    <Paper withBorder className="h-full overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
      <div className="h-[calc(100vh-112px)] min-h-[680px]">
        <Allotment>
          {statement && (
            <Allotment.Pane preferredSize="38%" minSize={280}>
              <div className="h-full overflow-auto border-r border-[var(--hydro-border)] p-5">
                <Group justify="space-between" mb="md" align="flex-start">
                  <div>
                    <Text size="xs" c="dimmed" fw={800}>{t('Problem')}</Text>
                    {title && <Title order={3} size="h4">{title}</Title>}
                  </div>
                </Group>
                {statement}
              </div>
            </Allotment.Pane>
          )}

          <Allotment.Pane minSize={420}>
            <Stack gap={0} className="h-full min-h-0">
              <Group justify="space-between" p="xs" className="border-b border-[var(--hydro-border)]">
                <Group gap="xs">
                  <Select
                    data={langOptions}
                    value={lang}
                    onChange={(v) => setLang(v || '')}
                    placeholder={t('Language')}
                    searchable
                    size="xs"
                    w={190}
                  />
                  <Badge variant="light" color="gray">{t('Monaco Editor')}</Badge>
                </Group>
                <Group gap="xs">
                  <Button size="xs" onClick={handleSubmit} loading={submitting}>
                    {t('Submit')}
                  </Button>
                  {onClose && (
                    <Button size="xs" variant="subtle" onClick={onClose}>
                      {t('Quit Scratchpad')}
                    </Button>
                  )}
                </Group>
              </Group>

              <div className="min-h-0 flex-1">
                <Allotment vertical>
                  <Allotment.Pane minSize={320}>
                    <CodeEditor
                      value={code}
                      onChange={setCode}
                      language={lang}
                      height="100%"
                    />
                  </Allotment.Pane>
                  <Allotment.Pane preferredSize={180} minSize={120}>
                    <Stack gap={0} className="h-full">
                      <Divider />
                      <Tabs defaultValue="records" keepMounted={false} className="flex h-full flex-col">
                        <Tabs.List px="xs">
                          <Tabs.Tab value="records">{t('Records')}</Tabs.Tab>
                          <Tabs.Tab value="pretest">{t('Pretest')}</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="records" className="min-h-0 flex-1">
                          <Paper p="sm" className="h-full overflow-auto border-t border-[var(--hydro-border)]">
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
                            ) : (
                              <Text size="sm" c="dimmed">{t('No records found')}</Text>
                            )}
                          </Paper>
                        </Tabs.Panel>
                        <Tabs.Panel value="pretest" className="min-h-0 flex-1">
                          <Paper p="sm" className="h-full overflow-auto border-t border-[var(--hydro-border)]">
                            <Textarea
                              value={input}
                              onChange={(e) => setInput(e.currentTarget.value)}
                              placeholder={t('Input')}
                              minRows={4}
                              autosize
                              styles={{ input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '13px' } }}
                            />
                          </Paper>
                        </Tabs.Panel>
                      </Tabs>
                    </Stack>
                  </Allotment.Pane>
                </Allotment>
              </div>
            </Stack>
          </Allotment.Pane>
        </Allotment>
      </div>
    </Paper>
  );
}
