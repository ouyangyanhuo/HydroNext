import { Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconCopy } from '@tabler/icons-react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData, useUserContext } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, PERM, useHasPerm } from '@/hooks/use-permission';

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
  const { args } = usePageData();
  const user = useUserContext();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const isLoggedIn = useIsLoggedIn();
  const storeCanCreate = useHasPerm(PERM.PERM_CREATE_PROBLEM);
  const canCreate = Boolean(args.canCreateProblem ?? (
    hasPermValue(user.perm, PERM.PERM_CREATE_PROBLEM) || storeCanCreate
  ));

  if (!isLoggedIn || !canCreate) {
    return (
      <Stack gap="lg">
        <PageHeader title={t('Import Problems')}>
          <Button component="a" href={buildUrl('problem_main')} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
            {t('Back')}
          </Button>
        </PageHeader>
        <Card withBorder p="lg" className="hydro-content-card">
          <Text c="dimmed">{t('You do not have permission to import problems.')}</Text>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={t('Import Problems')}>
        <Button component="a" href={buildUrl('problem_main')} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
      </PageHeader>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {IMPORT_SOURCES.map((source) => (
          <Card
            key={source.id}
            withBorder
            p="lg"
            className="hydro-content-card cursor-pointer transition-all duration-200 hover:shadow-md"
            component="a"
            href={source.id === 'hydro' ? buildUrl('problem_import_hydro') : source.href}
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
