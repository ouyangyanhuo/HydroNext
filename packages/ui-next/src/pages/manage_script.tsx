import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

function normalizeScripts(scripts: any) {
  if (Array.isArray(scripts)) {
    return scripts.map((item) => {
      if (typeof item === 'string') return { id: item, description: item };
      return { id: item.id || item.name, ...item };
    }).filter((item) => item.id && !item.hidden);
  }
  return Object.entries(scripts || {})
    .map(([id, script]: [string, any]) => ({ id, ...(script || {}) }))
    .filter((item) => item.id && !item.hidden);
}

export default function ManageScriptPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const scripts = normalizeScripts(args.scripts || {});
  const [selected, setSelected] = useState(scripts[0]?.id || '');
  const [rawArgs, setRawArgs] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedScript = scripts.find((script) => script.id === selected);

  const handleRun = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      JSON.parse(rawArgs || '{}');
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: selected, args: rawArgs || '{}' }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Run failed')));
      else if (data.redirect) navigate(data.redirect);
      else if (data.rid) navigate(`/record/${data.rid}`);
    } catch (err: any) {
      setError(err?.message || t('Invalid JSON'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Scripts')} />
      {error && <Text c="red" size="sm">{error}</Text>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card withBorder p="lg" className="hydro-content-card min-w-0 flex-1">
          <Group justify="space-between" mb="md">
            <Title order={3} size="h4">{t('Run script')}</Title>
            <Badge variant="light">{scripts.length}</Badge>
          </Group>
          <Stack gap="md">
            <Select
              label={t('Script')}
              data={scripts.map((script) => ({ value: script.id, label: `${script.id} - ${t(script.description || 'None')}` }))}
              value={selected}
              onChange={(value) => setSelected(value || '')}
              searchable
            />
            <TextInput
              label={t('Params')}
              value={rawArgs}
              onChange={(e) => setRawArgs(e.currentTarget.value)}
              styles={{ input: { fontFamily: 'var(--hydro-font-mono)' } }}
            />
            <Group justify="flex-end">
              <Button onClick={handleRun} loading={loading}>{t('Run')}</Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="lg" className="hydro-content-card w-full shrink-0 lg:w-80">
          <Title order={3} size="h4" mb="sm">{selectedScript?.id || t('Script')}</Title>
          <Text size="sm" c="dimmed">{t(selectedScript?.description || 'None')}</Text>
        </Card>
      </div>
    </Stack>
  );
}
