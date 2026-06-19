import { formatErrorMessage } from '@/utils/error';
import { Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsForm } from '@/components/common/settings-form';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ManageSettingPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const current = args.current || {};
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async (payload: Record<string, any>) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
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
      <PageHeader title={t('System Settings')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}

      <SettingsForm
        settings={args.settings || {}}
        current={current}
        payloadMode="nested"
        loading={loading}
        onSubmit={handleSave}
      />
    </Stack>
  );
}
