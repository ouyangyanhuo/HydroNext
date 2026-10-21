import { Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { SettingsForm } from '@/components/common/settings-form';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

export function DomainSettingsPage({ visibility = false }: { visibility?: boolean }) {
  const { args } = usePageData();
  const { t } = useI18n();
  const current = args.current || args.domain || args.ddoc || {};
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (payload: Record<string, any>) => {
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
        notifications.show({ title: formatErrorMessage(data.error, t('Save failed'), t), message: '', color: 'red' });
      } else if (data.url || data.redirect) {
        window.location.href = data.url || data.redirect;
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
      <PageHeader title={t(visibility ? 'Visibility and contests' : 'Domain Settings')}>
        <Button component={Link} to="domain_dashboard" variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
      </PageHeader>
      <SettingsForm
        settings={args.settings || {}}
        current={current}
        payloadMode="flat"
        loading={loading}
        onSubmit={handleSubmit}
        familyExtras={visibility ? { setting_contest_mode: (
          <Text size="sm" c="dimmed">{t('Contest mode takes priority over manual hiding. Turning it off restores your manual settings.')}</Text>
        ), setting_navigation: (
          <Text size="sm" c="dimmed">
            {t('Hiding Problems or Contests also hides its homepage list.')}
            {' '}{t('These settings apply only to this domain and do not change page permissions.')}
          </Text>
        ) } : undefined}
      />
    </Stack>
  );
}

export default function DomainEditPage() {
  return <DomainSettingsPage />;
}
