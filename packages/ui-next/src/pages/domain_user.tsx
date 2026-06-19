import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Checkbox, Group, Paper, ScrollArea, Select, Stack, Table, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { UserAvatar } from '@/components/user/user-avatar';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

function normalizeRoles(input: any) {
  if (Array.isArray(input)) return input;
  return Object.entries(input || {}).map(([id, role]: [string, any]) => ({
    _id: id,
    ...(typeof role === 'object' ? role : { perm: role }),
  }));
}

function flattenUsers(args: any, roles: any[]) {
  if (args.rudocs) {
    const result: any[] = [];
    for (const role of roles) {
      for (const udoc of args.rudocs[role._id] || []) {
        result.push({ ...udoc, role: udoc.role || role._id });
      }
    }
    return result;
  }
  const udict = args.udict || {};
  return (args.dudocs || []).map((dudoc: any) => ({
    ...dudoc,
    _id: dudoc.uid,
    ...(udict[dudoc.uid] || {}),
    role: dudoc.role || 'default',
  }));
}

export default function DomainUserPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const currentUser = useSessionStore((s) => s.user);
  const roles = useMemo(() => normalizeRoles(args.roles), [args.roles]);
  const users = useMemo(() => flattenUsers(args, roles), [args, roles]);
  const roleOptions = roles
    .filter((role: any) => role._id !== 'guest')
    .map((role: any) => ({ value: role._id, label: role._id }));
  const [selected, setSelected] = useState<number[]>([]);
  const [roleDraft, setRoleDraft] = useState<Record<number, string>>(() => Object.fromEntries(users.map((user: any) => [user._id, user.role || 'default'])));
  const [bulkRole, setBulkRole] = useState(roleOptions[0]?.value || 'default');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectableUsers = users.filter((user: any) => user._id !== currentUser?._id);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((user: any) => selected.includes(user._id));

  const post = async (payload: Record<string, any>, successMessage: string, reload = true) => {
    setLoading(String(payload.operation || 'operation'));
    setError('');
    setSuccess('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Operation failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else {
        setSuccess(successMessage);
        if (reload) window.location.reload();
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading('');
    }
  };

  const toggle = (uid: number, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, uid] : prev.filter((item) => item !== uid)));
  };

  const saveRoleDrafts = async () => {
    const changed = users.filter((user: any) => roleDraft[user._id] && roleDraft[user._id] !== (user.role || 'default'));
    let saved = false;
    for (const role of roleOptions.map((option) => option.value)) {
      const uids = changed.filter((user: any) => roleDraft[user._id] === role).map((user: any) => user._id);
      if (uids.length) {
        // eslint-disable-next-line no-await-in-loop
        await post({ operation: 'set_users', uids, role, join: false }, t('Saved'), false);
        saved = true;
      }
    }
    if (saved) window.location.reload();
    else setSuccess(t('No changes'));
  };

  const addUsers = async (values: Record<string, any>) => {
    const uids = String(values.uids || '')
      .split(/[\s,]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isSafeInteger(item) && item > 0);
    if (!uids.length) {
      setError(t('User ID is required'));
      return;
    }
    await post({ operation: 'set_users', uids, role: values.role || 'default', join: true }, t('Added'));
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Domain Users')}>
        <Button size="xs" onClick={() => setDialogOpen(true)}>{t('Add User')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}
      <Paper withBorder className="hydro-content-card">
        <ScrollArea>
          <Table striped highlightOnHover miw={760}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={44}>
                <Checkbox
                  aria-label={t('Select All')}
                  checked={allSelected}
                  onChange={(e) => setSelected(e.currentTarget.checked ? selectableUsers.map((user: any) => user._id) : [])}
                />
              </Table.Th>
              <Table.Th>{t('User ID')}</Table.Th>
              <Table.Th>{t('Username')}</Table.Th>
              <Table.Th>{t('Role')}</Table.Th>
              <Table.Th>{t('Status')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user: any) => {
              const disabled = user._id === currentUser?._id;
              return (
                <Table.Tr key={user._id}>
                  <Table.Td>
                    <Checkbox
                      aria-label={String(user._id)}
                      disabled={disabled}
                      checked={selected.includes(user._id)}
                      onChange={(e) => toggle(user._id, e.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td><Text size="sm">{user._id}</Text></Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <UserAvatar user={user} size="xs" />
                      <Link to="user_detail" params={{ uid: user._id }} className="no-underline hover:underline">
                        <Text size="sm">{user.uname || user._id}</Text>
                      </Link>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      w={160}
                      data={roleOptions}
                      value={roleDraft[user._id] || user.role || 'default'}
                      disabled={disabled}
                      onChange={(value) => setRoleDraft((prev) => ({ ...prev, [user._id]: value || 'default' }))}
                    />
                  </Table.Td>
                  <Table.Td>
                    {user.join === false
                      ? <Badge color="orange" variant="light">{t('Not joined yet')}</Badge>
                      : <Badge color="green" variant="light">{t('Joined')}</Badge>}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        </ScrollArea>
        <Group justify="space-between" p="md" wrap="wrap">
          <Group gap="xs">
            <Button
              variant="light"
              color="red"
              disabled={!selected.length}
              loading={loading === 'kick'}
              onClick={() => post({ operation: 'kick', uids: selected }, t('Removed'))}
            >
              {t('Remove Selected User')}
            </Button>
            <Button
              variant="light"
              loading={loading === 'set_users'}
              onClick={saveRoleDrafts}
            >
              {t('Save Role Changes')}
            </Button>
          </Group>
          <Group gap="xs">
            <Select size="xs" w={160} data={roleOptions} value={bulkRole} onChange={(value) => setBulkRole(value || 'default')} />
            <Button
              disabled={!selected.length}
              loading={loading === 'set_users'}
              onClick={() => post({ operation: 'set_users', uids: selected, role: bulkRole, join: false }, t('Saved'))}
            >
              {t('Set Roles for Selected User')}
            </Button>
          </Group>
        </Group>
      </Paper>
      <FormDialog
        opened={dialogOpen}
        title={t('Add User')}
        fields={[
          { name: 'uids', label: t('User ID'), type: 'textarea', required: true, placeholder: '2, 3, 4' },
          { name: 'role', label: t('Role'), type: 'select', data: roleOptions, defaultValue: roleOptions[0]?.value || 'default', required: true },
        ]}
        onClose={() => setDialogOpen(false)}
        onSubmit={addUsers}
        confirmLabel={t('Add User')}
        cancelLabel={t('Cancel')}
        loading={loading === 'set_users'}
        error={error}
      />
    </Stack>
  );
}
