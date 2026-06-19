import { formatErrorMessage } from '@/utils/error';
import { Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
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

  const handleSave = async (payload: Record<string, any>) => {
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Save failed')), message: '', color: 'red' });
      } else {
        notifications.show({ title: t('Saved'), message: '', color: 'green' });
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('System Settings')} />

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
