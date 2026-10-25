import { Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { RuntimeStatusCard } from '@/components/manage/runtime-status-card';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { useManageEntries } from '@/registry/manage-entries';

const entries = [
  { to: 'manage_user', title: 'User Management', desc: 'View users and reset passwords.', group: 'Users' },
  { to: 'manage_user_priv', title: 'User Privileges', desc: 'Inspect and edit user privilege values.', group: 'Users' },
  { to: 'manage_system_data', title: 'System Data', desc: 'View domains and additional files.', group: 'Data' },
  { to: 'manage_setting', title: 'System Settings', desc: 'Runtime settings grouped by feature.', group: 'Configuration' },
  { to: 'manage_proctor', title: 'Proctor settings', desc: 'Manage authentication keys, session policy and encrypted logs.', group: 'Configuration' },
  { to: 'status', title: 'Service Status', desc: 'Check service health and runtime status.', group: 'Tools' },
  { to: 'manage_script', title: 'Scripts', desc: 'Run registered maintenance scripts.', group: 'Tools' },
  { to: 'manage_config', title: 'Configuration', desc: 'Edit raw YAML configuration source.', group: 'Configuration' },
].map((entry, index) => ({ ...entry, order: index * 10 }));

export default function ManageDashboardPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const isSu = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const extraEntries = useManageEntries();
  const allEntries = useMemo(() => [...entries, ...extraEntries].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)), [extraEntries]);

  if (!isSu) {
    return (
      <Stack gap="lg">
        <PageHeader title={t('System Management')} />
        <Text c="dimmed">{t('Access Denied')}</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={t('System Management')} />
      <RuntimeStatusCard runtime={args.runtime} />
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
        {allEntries.map((entry) => (
          <Card key={entry.to} withBorder p="lg" className="hydro-card">
            <Stack gap="sm" className="h-full">
              <Group justify="space-between" align="flex-start">
                <Title order={3} size="h4">{t(entry.title)}</Title>
                <Badge variant="light">{t(entry.group)}</Badge>
              </Group>
              <Text size="sm" c="dimmed" className="min-h-10">{t(entry.desc)}</Text>
              <Group justify="flex-end" mt="auto">
                <Button component={Link} to={entry.to} size="xs" variant="light">
                  {t('Open Panel')}
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
