import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { CodeEditor } from '@/components/editor/code-editor';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ManageConfigPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const [value, setValue] = useState(args.value || args.config || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ value }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Save failed')));
      else setSuccess(t('Saved'));
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Configuration')}>
        <Button onClick={handleSave} loading={loading} size="xs">{t('Save')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card withBorder p="lg" className="hydro-content-card min-w-0 flex-1">
          <Group justify="space-between" mb="md">
            <Title order={3} size="h4">{t('Config Source')}</Title>
            <Badge variant="light">YAML</Badge>
          </Group>
          <CodeEditor value={value} onChange={setValue} language="yaml" height={680} />
        </Card>

        <Stack gap="lg" className="w-full shrink-0 lg:w-80">
          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="sm">{t('Configuration')}</Title>
            <Text size="sm" c="dimmed">
              {t('Secrets marked as hidden keep their old values when left unchanged.')}
            </Text>
          </Card>
        </Stack>
      </div>
    </Stack>
  );
}
