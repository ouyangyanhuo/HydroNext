import { Button, Group, Paper, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainPermissionPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const perms = args.perms || {};
  const [form, setForm] = useState(perms);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(form) });
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Permissions')}>
        <Button onClick={handleSave} loading={loading} size="xs">{t('Save')}</Button>
      </PageHeader>
      <Paper withBorder p="lg">
        <Stack gap="sm">
          {Object.entries(form).map(([key, val]: [string, any]) => (
            <Group key={key} justify="space-between">
              <Text size="sm">{key}</Text>
              <Switch checked={!!val} onChange={(e) => setForm({ ...form, [key]: e.currentTarget.checked })} />
            </Group>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
