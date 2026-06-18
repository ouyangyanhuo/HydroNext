import { Paper, Stack, Table, Text, Title } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemFilesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const pdoc = args.pdoc || {};
  const testdata = args.testdata || [];
  

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Files')} - ${pdoc.pid}. ${pdoc.title}`} />
      <Paper withBorder p="lg">
        <Title order={4} mb="sm">{t('Test Data')}</Title>
        {testdata.length === 0 ? (
          <Text c="dimmed" size="sm">{t('No files')}</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr><Table.Th>{t('Name')}</Table.Th><Table.Th>{t('Size')}</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {testdata.map((f: any) => (
                <Table.Tr key={f.name}><Table.Td>{f.name}</Table.Td><Table.Td>{Math.round((f.size || 0) / 1024)}KB</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
