import { Paper, Title, Stack, Text, Group, SimpleGrid, Button } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { PageHeader } from '@/components/common/page-header';

export default function ManageDashboardPage() {
    const { args } = usePageData();
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
