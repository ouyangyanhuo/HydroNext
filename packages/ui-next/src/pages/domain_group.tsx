import { Checkbox, Group, Paper, ScrollArea, Stack, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';
import { postJsonRequest } from '@/utils/request';

function parseUids(input: string) {
  return input
    .split(/[\s,]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isSafeInteger(item) && item > 0);
}

export default function DomainGroupPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const domainId = useSessionStore((s) => s.ui.domainId);
  const groups = args.groups || [];
  const [selected, setSelected] = useState<string[]>([]);
  const [uidsDraft, setUidsDraft] = useState<Record<string, string>>(() => Object.fromEntries(
    groups.map((group: any) => [group.name, (group.uids || []).join(',')]),
  ));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState('');

  const post = async (payload: Record<string, any>, successMessage: string, reload = true) => {
    setLoading(String(payload.operation || 'operation'));
    try {
      await postJsonRequest(window.location.href, payload,
        (error) => formatErrorMessage(error, 'Operation failed', t), { redirects: 'authorization' });
      notifications.show({ title: successMessage, message: '', color: 'green' });
      if (reload) window.location.reload();
      return true;
    } catch (err: any) {
      notifications.show({ title: t(err?.message || 'Network error'), message: '', color: 'red' });
      return false;
    } finally {
      setLoading('');
    }
  };

  const toggle = (name: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, name] : prev.filter((item) => item !== name)));
  };

  const saveAll = async () => {
    for (const group of groups) {
      const next = parseUids(uidsDraft[group.name] || '');
      const current = (group.uids || []).join(',');
      if (next.join(',') !== current) {
        if (!await post({ operation: 'update', name: group.name, uids: next }, t('Saved'), false)) return;
      }
    }
    window.location.reload();
  };

  const deleteSelected = async () => {
    for (const name of selected) {
      if (!await post({ operation: 'del', name }, t('Deleted'), false)) return;
    }
    window.location.reload();
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Groups')}>
        <Button component={Link} href={`/d/${domainId}/domain/dashboard`} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
        <Button size="xs" onClick={() => setDialogOpen(true)}>{t('Create Group')}</Button>
      </PageHeader>
      <Paper withBorder className="hydro-content-card">
        <ScrollArea>
          <Table striped highlightOnHover miw={680}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={44}>
                  <Checkbox
                    aria-label={t('Select All')}
                    checked={groups.length > 0 && groups.every((group: any) => selected.includes(group.name))}
                    onChange={(e) => setSelected(e.currentTarget.checked ? groups.map((group: any) => group.name) : [])}
                  />
                </Table.Th>
                <Table.Th>{t('Group Name')}</Table.Th>
                <Table.Th>{t('Users')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groups.map((g: any) => (
                <Table.Tr key={g.name}>
                  <Table.Td>
                    <Checkbox
                      aria-label={g.name}
                      checked={selected.includes(g.name)}
                      onChange={(e) => toggle(g.name, e.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw="var(--hydro-weight-semibold)">{g.name}</Text>
                    <Text size="xs" c="dimmed">{g.uids?.length || 0} {t('members')}</Text>
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      value={uidsDraft[g.name] ?? (g.uids || []).join(',')}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setUidsDraft((prev) => ({ ...prev, [g.name]: value }));
                      }}
                      placeholder="2,3,4"
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="flex-end" p="md">
          <Button variant="light" color="red" disabled={!selected.length} loading={loading === 'del'} onClick={deleteSelected}>
            {t('Remove Selected Group')}
          </Button>
          <Button loading={loading === 'update'} onClick={saveAll}>
            {t('Save All Changes')}
          </Button>
        </Group>
      </Paper>
      <FormDialog
        opened={dialogOpen}
        title={t('Create Group')}
        fields={[
          { name: 'name', label: t('Group Name'), required: true },
          { name: 'uids', label: t('Users'), type: 'textarea', placeholder: '2,3,4' },
        ]}
        onClose={() => setDialogOpen(false)}
        onSubmit={async (values) => {
          await post({ operation: 'update', name: values.name, uids: parseUids(String(values.uids || '')) }, t('Created'));
        }}
        confirmLabel={t('Create')}
        cancelLabel={t('Cancel')}
        loading={loading === 'update'}
      />
    </Stack>
  );
}
