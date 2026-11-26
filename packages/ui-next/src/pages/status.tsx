import { Badge, Stack, Text } from '@mantine/core';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function StatusPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const judges = (args.judges || []).map((judge: any, index: number) => ({
    ...judge,
    _id: judge._id || judge.name || `judge-${index}`,
    displayName: judge.name || `Judge ${index + 1}`,
  }));
  const uptime = args.uptime;

  return (
    <Stack gap="lg">
      <PageHeader
        title={t('Service Status')}
        back={{ to: 'manage_dashboard', label: t('System Management') }}
        description={uptime ? `${t('Uptime')}: ${uptime}` : undefined}
      />
      <DataTable
        columns={[
          { key: 'displayName', title: t('Judge'), render: (j: any) => <Text size="sm">{j.displayName}</Text> },
          { key: 'status', title: t('Status'), render: () => <Badge size="xs" color="green">{t('Online')}</Badge> },
          {
            key: 'tasks',
            title: t('Tasks'),
            align: 'right',
            render: (j: any) => <Text size="sm" className="hydro-numeric">{j.tasks || 0}</Text>,
          },
        ]}
        data={judges}
        emptyMessage={t('No judges connected')}
      />
    </Stack>
  );
}
