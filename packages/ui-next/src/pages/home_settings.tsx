import { formatErrorMessage } from '@/utils/error';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsForm } from '@/components/common/settings-form';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

export default function HomeSettingsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const category = args.category || 'preference';
  const current = args.current || user || {};
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (payload: Record<string, any>) => {
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
      else if (data.redirect) window.location.href = data.redirect;
      else setSuccess(t('Settings saved'));
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    ['preference', t('Preference')],
    ['account', t('Account')],
    ['domain', t('Domain')],
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={t('Settings')}>
        <Group gap="xs">
          {sections.map(([key, label]) => (
            <Button
              key={key}
              component="a"
              href={`/home/settings/${key}`}
              variant={category === key ? 'filled' : 'light'}
              size="xs"
            >
              {label}
            </Button>
          ))}
        </Group>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}
      {category === 'account' && (
        <Card withBorder p="lg" className="hydro-content-card">
          <Group gap="md">
            <UserAvatar user={current} size={72} />
            <Stack gap={4}>
              <Text fw={700}>{t('Avatar')}</Text>
              <Text c="dimmed" size="sm">{t('You can also upload your avatar to Gravatar and it will be automatically updated here.')}</Text>
            </Stack>
          </Group>
        </Card>
      )}
      <SettingsForm
        settings={args.settings || {}}
        current={current}
        payloadMode="flat"
        extraPayload={{ category }}
        loading={loading}
        onSubmit={handleSubmit}
      />
    </Stack>
  );
}
