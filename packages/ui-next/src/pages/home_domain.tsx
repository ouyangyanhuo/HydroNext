import { Paper, Stack, Text, Group, Avatar, Button, SimpleGrid } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { PageHeader } from '@/components/common/page-header';

export default function HomeDomainPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const dudict = args.dudict || {};
    const ddocs = args.ddocs || [];

    return (
        <Stack gap="lg">
            <PageHeader title={t('My Domains')}>
                <Button component={Link} to="domain_create" size="xs">{t('Create Domain')}</Button>
            </PageHeader>
            {ddocs.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">{t('No domains')}</Text>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                    {ddocs.map((d: any) => (
                        <Paper key={d._id} withBorder p="md">
                            <Group gap="sm">
                                <Avatar src={d.avatar} size="sm" radius="xl" />
                                <div>
                                    <Link to="domain_dashboard" params={{ domainId: d._id }} className="no-underline hover:underline">
                                        <Text fw={500} size="sm">{d.name}</Text>
                                    </Link>
                                    <Text size="xs" c="dimmed">{d._id}</Text>
                                </div>
                            </Group>
                        </Paper>
                    ))}
                </SimpleGrid>
            )}
        </Stack>
    );
}
