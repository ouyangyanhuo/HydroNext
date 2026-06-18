import { Button, Group, Paper, Select, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ManageScriptPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const scripts = args.scripts || [];
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState('');

  const handleRun = async () => {
    if (!selected) return;
    setLoading(true); setOutput('');
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ script: selected }) });
      const data = await res.json();
      if (data.error) setOutput(`Error: ${data.error.message}`);
      else setOutput(data.output || 'Done');
    } catch { setOutput('Network error'); } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Scripts')} />
      <Paper withBorder p="lg">
        <Stack gap="md">
          <Select label={t('Script')} data={scripts.map((s: any) => ({ value: s.id || s, label: s.description || s.id || s }))} value={selected} onChange={(v) => setSelected(v || '')} searchable />
          <Group justify="flex-end"><Button onClick={handleRun} loading={loading}>{t('Run')}</Button></Group>
          {output && <Paper withBorder p="md"><Text size="sm" ff="monospace" style={{ whiteSpace: 'pre-wrap' }}>{output}</Text></Paper>}
        </Stack>
      </Paper>
    </Stack>
  );
}
