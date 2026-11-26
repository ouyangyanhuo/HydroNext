import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { TwoColumnLayout } from '@/components/common/two-column-layout';
import { CodeEditor } from '@/components/editor/code-editor';
import { ErrorBanner, SuccessBanner } from '@/components/feedback/error-banner';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

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
      <PageHeader
        title={t('Configuration')}
        back={{ to: 'manage_dashboard', label: t('System Management') }}
      >
        <Button onClick={handleSave} loading={loading} size="xs">{t('Save')}</Button>
      </PageHeader>
      <ErrorBanner message={error} onClose={() => setError('')} />
      <SuccessBanner message={success} onClose={() => setSuccess('')} />

      <TwoColumnLayout
        sidebarWidth="wide"
        sidebar={(
          <Stack gap="lg">
            <Card withBorder p="lg" className="hydro-content-card">
              <Title order={3} size="h4" mb="sm">{t('Configuration')}</Title>
              <Text size="sm" c="dimmed">
                {t('Secrets marked as hidden keep their old values when left unchanged.')}
              </Text>
            </Card>
          </Stack>
        )}
      >
        <Card withBorder p="lg" className="hydro-content-card">
          <Group justify="space-between" mb="md">
            <Title order={3} size="h4">{t('Config Source')}</Title>
            <Badge variant="light">YAML</Badge>
          </Group>
          <CodeEditor value={value} onChange={setValue} language="yaml" height={680} />
        </Card>
      </TwoColumnLayout>
    </Stack>
  );
}
