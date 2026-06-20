import { Button, Checkbox, Group, Paper, ScrollArea, Stack, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function parseUids(input: string) {
  return input
    .split(/[\s,]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isSafeInteger(item) && item > 0);
}

export default function DomainGroupPage() {
  const { args } = usePageData();
  const { t } = useI18n();
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
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Operation failed')), message: '', color: 'red' });
      } else if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        notifications.show({ title: successMessage, message: '', color: 'green' });
        if (reload) window.location.reload();
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
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
        await post({ operation: 'update', name: group.name, uids: next }, t('Saved'), false);
      }
    }
    window.location.reload();
  };

  const deleteSelected = async () => {
    for (const name of selected) {
      await post({ operation: 'del', name }, t('Deleted'), false);
    }
    window.location.reload();
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Groups')}>
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
                    <Text size="sm" fw={600}>{g.name}</Text>
                    <Text size="xs" c="dimmed">{g.uids?.length || 0} {t('members')}</Text>
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      value={uidsDraft[g.name] ?? (g.uids || []).join(',')}
                      onChange={(e) => setUidsDraft((prev) => ({ ...prev, [g.name]: e.currentTarget.value }))}
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
        onSubmit={(values) => post({
          operation: 'update',
          name: values.name,
          uids: parseUids(String(values.uids || '')),
        }, t('Created'))}
        confirmLabel={t('Create')}
        cancelLabel={t('Cancel')}
        loading={loading === 'update'}
      />
    </Stack>
  );
}
