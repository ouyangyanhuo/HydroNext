import { Button, SimpleGrid, Stack } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';

export default function ManageDashboardPage() {
  
  const { t } = useI18n();

  return (
    <Stack gap="lg">
      <PageHeader title={t('System Management')} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Button component={Link} to="manage_setting" fullWidth variant="light">{t('System Settings')}</Button>
        <Button component={Link} to="manage_config" fullWidth variant="light">{t('Configuration')}</Button>
        <Button component={Link} to="manage_script" fullWidth variant="light">{t('Scripts')}</Button>
        <Button component={Link} to="manage_user_import" fullWidth variant="light">{t('User Import')}</Button>
        <Button component={Link} to="manage_user_priv" fullWidth variant="light">{t('User Privileges')}</Button>
        <Button component={Link} to="status" fullWidth variant="light">{t('Service Status')}</Button>
      </SimpleGrid>
    </Stack>
  );
}
