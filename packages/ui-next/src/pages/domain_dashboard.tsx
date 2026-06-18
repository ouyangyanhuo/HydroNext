import { Paper, Title, Stack, Text, Group, SimpleGrid, Button, Badge } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useDomain } from '@/hooks/use-domain';
import { PageHeader } from '@/components/common/page-header';

export default function DomainDashboardPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const domain = useDomain();
    const ddoc = args.ddoc || domain;
    const ucnt = args.ucnt || 0;
    const pcnt = args.pcnt || 0;
    const tcnt = args.tcnt || 0;

    return (
        <Stack gap="lg">
            <PageHeader title={`${t('Domain Manage')} - ${ddoc.name}`}>
                <Button component={Link} to="domain_edit" params={{ domainId: ddoc._id || 'system' }} size="xs">{t('Settings')}</Button>
            </PageHeader>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Paper withBorder p="md" ta="center">
                    <Text size="xl" fw={700}>{ucnt}</Text>
                    <Text size="xs" c="dimmed">{t('Users')}</Text>
                </Paper>
                <Paper withBorder p="md" ta="center">
                    <Text size="xl" fw={700}>{pcnt}</Text>
                    <Text size="xs" c="dimmed">{t('Problems')}</Text>
                </Paper>
                <Paper withBorder p="md" ta="center">
                    <Text size="xl" fw={700}>{tcnt}</Text>
                    <Text size="xs" c="dimmed">{t('Contests')}</Text>
                </Paper>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Button component={Link} to="domain_user" fullWidth variant="light">{t('User Management')}</Button>
                <Button component={Link} to="domain_role" fullWidth variant="light">{t('Role Management')}</Button>
                <Button component={Link} to="domain_permission" fullWidth variant="light">{t('Permissions')}</Button>
                <Button component={Link} to="domain_group" fullWidth variant="light">{t('Groups')}</Button>
            </SimpleGrid>
        </Stack>
    );
}
