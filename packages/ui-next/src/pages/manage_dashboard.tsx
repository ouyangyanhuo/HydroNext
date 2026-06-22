import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';

const entries = [
  { to: 'manage_setting', title: 'System Settings', desc: 'Runtime settings grouped by feature.', group: 'Configuration' },
  { to: 'manage_config', title: 'Configuration', desc: 'Edit raw YAML configuration source.', group: 'Configuration' },
  { to: 'manage_script', title: 'Scripts', desc: 'Run registered maintenance scripts.', group: 'Tools' },
  { to: 'manage_system_data', title: 'System Data', desc: 'View domains and additional files.', group: 'Data' },
  { to: 'manage_user', title: 'User Management', desc: 'View users and reset passwords.', group: 'Users' },
  { to: 'manage_user_import', title: 'User Import', desc: 'Preview and import users in batches.', group: 'Users' },
  { to: 'manage_user_priv', title: 'User Privileges', desc: 'Inspect and edit user privilege values.', group: 'Users' },
  { to: 'status', title: 'Service Status', desc: 'Check service health and runtime status.', group: 'Tools' },
];

export default function ManageDashboardPage() {
  const { t } = useI18n();
  const isSu = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);

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
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
        {entries.map((entry) => (
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
