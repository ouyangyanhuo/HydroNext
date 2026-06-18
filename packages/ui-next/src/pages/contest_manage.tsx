import { Badge, Button, Paper, Stack, Table, Tabs, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function ContestManagePage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const tdoc = args.tdoc || {};
  const pdict = args.pdict || {};
  const rdocs = args.rdocs || [];

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Manage')} - ${tdoc.title}`}>
        <Button component={Link} to="contest_edit" params={{ tid: tdoc.docId }} size="xs" variant="light">{t('Edit')}</Button>
      </PageHeader>

      <Tabs defaultValue="submissions">
        <Tabs.List>
          <Tabs.Tab value="submissions">{t('Submissions')}</Tabs.Tab>
          <Tabs.Tab value="problems">{t('Problems')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="submissions" pt="md">
          <Paper withBorder>
            <Table striped>
              <Table.Thead>
                <Table.Tr><Table.Th>#</Table.Th><Table.Th>{t('User')}</Table.Th><Table.Th>{t('Problem')}</Table.Th><Table.Th>{t('Status')}</Table.Th><Table.Th>{t('Score')}</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rdocs.map((r: any) => (
                  <Table.Tr key={r._id}>
                    <Table.Td><Link to="record_detail" params={{ rid: r._id }} className="text-xs">{String(r._id).slice(-6)}</Link></Table.Td>
                    <Table.Td><Text size="sm">{r.uname || r.uid}</Text></Table.Td>
                    <Table.Td><Text size="sm">{pdict[r.pid]?.title || r.pid}</Text></Table.Td>
                    <Table.Td><RecordStatusBadge status={r.status} size="xs" /></Table.Td>
                    <Table.Td><Badge size="xs">{r.score ?? '-'}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="problems" pt="md">
          <Paper withBorder p="md">
            <Text size="sm">{t('Problems')}: {Object.keys(pdict).length}</Text>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
