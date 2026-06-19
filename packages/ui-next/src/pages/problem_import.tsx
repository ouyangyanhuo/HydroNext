import { Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconCopy, IconFileImport } from '@tabler/icons-react';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { useIsLoggedIn } from '@/hooks/use-current-user';

const IMPORT_SOURCES = [
  {
    id: 'hydro',
    icon: IconCopy,
    title: 'Hydro',
    description: 'Import problems from a Hydro system export file (.zip)',
    href: '/problem/import/hydro',
  },
];

export default function ProblemImportPage() {
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();
  const canCreate = useHasPriv(PRIV.PRIV_CREATE_PROBLEM);

  if (!isLoggedIn || !canCreate) {
    return (
      <Stack gap="lg">
        <PageHeader title={t('Import Problems')} />
        <Card withBorder p="lg" className="hydro-content-card">
          <Text c="dimmed">{t('You do not have permission to import problems.')}</Text>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={t('Import Problems')} />

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {IMPORT_SOURCES.map((source) => (
          <Card
            key={source.id}
            withBorder
            p="lg"
            className="hydro-content-card cursor-pointer transition-shadow hover:shadow-md"
            component="a"
            href={source.href}
          >
            <Stack gap="sm">
              <Group gap="sm">
                <source.icon size={24} stroke={1.5} />
                <Title order={4}>{source.title}</Title>
              </Group>
              <Text size="sm" c="dimmed">{source.description}</Text>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder p="md" className="hydro-content-card">
        <Text size="sm" c="dimmed">
          {t('More import sources can be added via plugins.')}
        </Text>
      </Card>
    </Stack>
  );
}
