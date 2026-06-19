import yaml from 'js-yaml';
import { Badge, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { CodeEditor } from '@/components/editor/code-editor';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function toText(config: any) {
  if (!config) return '';
  if (typeof config === 'string') return config;
  return yaml.dump(config);
}

function parseConfig(text: string) {
  try {
    return (yaml.load(text) || {}) as Record<string, any>;
  } catch {
    return {};
  }
}

function formatSize(size?: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function ProblemConfigPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const testdata = args.testdata || [];
  const [config, setConfig] = useState(toText(args.config || pdoc.config || {}));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const parsed = useMemo(() => parseConfig(config), [config]);

  const updateConfig = (patch: Record<string, any>) => {
    setConfig(yaml.dump({ ...parsed, ...patch }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('operation', 'upload_file');
      form.append('filename', 'config.yaml');
      form.append('type', 'testdata');
      form.append('file', new Blob([config], { type: 'text/yaml' }), 'config.yaml');
      const res = await fetch(`/p/${pdoc.pid || pdoc.docId}/files`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: form,
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Save failed')));
      else navigate(window.location.href);
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      key: 'name',
      title: t('Filename'),
      render: (file: any) => <Text size="sm" fw={600}>{file.name}</Text>,
    },
    {
      key: 'size',
      title: t('Size'),
      width: 100,
      align: 'right' as const,
      render: (file: any) => <Text size="xs" c="dimmed">{formatSize(file.size)}</Text>,
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Judge Config')} - ${pdoc.pid}. ${pdoc.title}`}>
        <Button onClick={handleSave} loading={loading} size="xs">{t('Save')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Stack gap="lg" className="min-w-0 flex-1">
          <Card withBorder p="lg" className="hydro-content-card">
            <Group justify="space-between" mb="md">
              <Title order={3} size="h4">{t('Basic')}</Title>
              <Badge variant="light">config.yaml</Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Select
                label={t('Problem Type')}
                value={parsed.type || 'default'}
                data={[
                  { value: 'default', label: 'default' },
                  { value: 'objective', label: 'objective' },
                  { value: 'submit_answer', label: 'submit_answer' },
                  { value: 'remote_judge', label: 'remote_judge' },
                ]}
                onChange={(value) => updateConfig({ type: value || 'default' })}
              />
              <TextInput
                label={t('Languages')}
                value={(parsed.langs || []).join(', ')}
                onChange={(e) => updateConfig({ langs: e.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean) })}
              />
              <NumberInput
                label={t('Time Limit')}
                value={Number(parsed.time || parsed.timeMax || 1000)}
                min={1}
                onChange={(value) => updateConfig({ time: Number(value) || 1000 })}
              />
              <NumberInput
                label={t('Memory Limit')}
                value={Number(parsed.memory || parsed.memoryMax || 256)}
                min={1}
                onChange={(value) => updateConfig({ memory: Number(value) || 256 })}
              />
            </SimpleGrid>
          </Card>

          <Card withBorder p="lg" className="hydro-content-card">
            <Group justify="space-between" mb="md">
              <Title order={3} size="h4">{t('Config Editor')}</Title>
              <Text size="xs" c="dimmed">{t('YAML')}</Text>
            </Group>
            <CodeEditor value={config} onChange={setConfig} language="yaml" height={520} />
          </Card>
        </Stack>

        <Stack gap="lg" className="w-full shrink-0 lg:w-80">
          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="md">{testdata.length} {t('Testdata')}</Title>
            <DataTable
              columns={columns}
              data={testdata.map((file: any) => ({ ...file, _id: file.name }))}
              emptyMessage={t('No files')}
            />
          </Card>
        </Stack>
      </div>
    </Stack>
  );
}
