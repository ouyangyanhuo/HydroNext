import { Avatar, Badge, Button, Checkbox, Group, Loader, Modal, Paper, ScrollArea, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';

function normalizeRoles(input: any) {
  if (Array.isArray(input)) return input;
  if (input instanceof Map) {
    return Array.from(input.entries()).map(([id, role]: [string, any]) => ({
      _id: id,
      ...(typeof role === 'object' && role ? role : { perm: role }),
    }));
  }
  return Object.entries(input || {}).map(([id, role]: [string, any]) => ({
    _id: id,
    ...(typeof role === 'object' && role ? role : { perm: role }),
  }));
}

function flattenUsers(args: any, roles: any[]) {
  if (args.rudocs) {
    const result: any[] = [];
    for (const role of roles) {
      const roleUsers = args.rudocs instanceof Map ? args.rudocs.get(role._id) : args.rudocs[role._id];
      for (const udoc of roleUsers || []) {
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

interface UserSearchItem {
  _id: number;
  uname: string;
  displayName?: string;
  avatar?: string;
  avatarUrl?: string;
}

function formatUserLabel(user: UserSearchItem) {
  return user.displayName ? `${user.uname} (${user.displayName})` : user.uname;
}

function AddUserDialog({
  opened,
  onClose,
  roleOptions,
  defaultRole,
  domainId,
  loading,
  onSubmit,
}: {
  opened: boolean;
  onClose: () => void;
  roleOptions: { value: string, label: string }[];
  defaultRole: string;
  domainId: string;
  loading: boolean;
  onSubmit: (uids: number[], role: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState(defaultRole);
  const [results, setResults] = useState<UserSearchItem[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (!opened) return;
    setQuery('');
    setResults([]);
    setSelectedUsers([]);
    setSearchError('');
    setRole(defaultRole);
  }, [opened, defaultRole]);

  useEffect(() => {
    if (!opened) return undefined;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearchError('');
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const res = await fetch(`/d/${encodeURIComponent(domainId)}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            args: { search: trimmed, limit: 10 },
            projection: ['_id', 'uname', 'displayName', 'avatar', 'avatarUrl'],
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setSearchError(formatErrorMessage(data.error, t('User search failed')));
          setResults([]);
        } else {
          const users = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
          setResults(users.filter((user: any) => Number.isSafeInteger(Number(user._id))));
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setSearchError(err?.message || t('User search failed'));
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [domainId, opened, query, t]);

  const selectedIds = new Set(selectedUsers.map((user) => user._id));
  const addUser = (user: UserSearchItem) => {
    if (selectedIds.has(user._id)) return;
    setSelectedUsers((prev) => [...prev, user]);
  };
  const removeUser = (uid: number) => setSelectedUsers((prev) => prev.filter((user) => user._id !== uid));

  return (
    <Modal opened={opened} onClose={onClose} title={t('Add User')} size="lg">
      <Stack gap="md">
        <TextInput
          label={t('Search users by username or UID')}
          placeholder={t('Type to search users')}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          rightSection={searching ? <Loader size={16} /> : null}
          autoFocus
        />
        {searchError && <Text c="red" size="sm">{searchError}</Text>}
        <Paper withBorder p={0}>
          <ScrollArea.Autosize mah={220}>
            <Stack gap={0}>
              {!query.trim() && <Text c="dimmed" size="sm" p="md">{t('Type to search users')}</Text>}
              {query.trim() && !searching && !results.length && !searchError && (
                <Text c="dimmed" size="sm" p="md">{t('No users found')}</Text>
              )}
              {results.map((user) => {
                const added = selectedIds.has(user._id);
                return (
                  <Group
                    key={user._id}
                    justify="space-between"
                    wrap="nowrap"
                    p="sm"
                    className="border-b border-[var(--hydro-border)] last:border-b-0"
                  >
                    <Group gap="sm" wrap="nowrap" miw={0}>
                      <Avatar src={user.avatarUrl || getAvatarUrl(user.avatar || '', 32)} size="sm" radius="xl">
                        {user.uname?.[0]?.toUpperCase()}
                      </Avatar>
                      <div className="min-w-0">
                        <Text size="sm" fw={500} truncate>{formatUserLabel(user)}</Text>
                        <Text size="xs" c="dimmed">UID = {user._id}</Text>
                      </div>
                    </Group>
                    <Button size="compact-xs" variant={added ? 'default' : 'light'} disabled={added} onClick={() => addUser(user)}>
                      {added ? t('Selected') : t('Select')}
                    </Button>
                  </Group>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        </Paper>
        <Stack gap="xs">
          <Text size="sm" fw={600}>{t('Selected Users')}</Text>
          {selectedUsers.length ? (
            <Group gap="xs">
              {selectedUsers.map((user) => (
                <Badge
                  key={user._id}
                  variant="light"
                  size="lg"
                  rightSection={(
                    <button
                      type="button"
                      className="ml-1 text-xs"
                      onClick={() => removeUser(user._id)}
                      aria-label={t('Remove')}
                    >
                      x
                    </button>
                  )}>
                  {formatUserLabel(user)} #{user._id}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text c="dimmed" size="sm">{t('No users selected')}</Text>
          )}
        </Stack>
        <Select
          label={t('Role')}
          data={roleOptions}
          value={role}
          onChange={(value) => setRole(value || defaultRole)}
          required
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t('Cancel')}</Button>
          <Button loading={loading} disabled={!selectedUsers.length} onClick={() => onSubmit(selectedUsers.map((user) => user._id), role)}>
            {t('Add User')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function DomainUserPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const currentUser = useSessionStore((s) => s.user);
  const domainId = useSessionStore((s) => s.ui.domainId);
  const roles = useMemo(() => normalizeRoles(args.roles), [args.roles]);
  const users = useMemo(() => flattenUsers(args, roles), [args, roles]);
  const roleOptions = useMemo(() => roles
    .filter((role: any) => role._id !== 'guest')
    .map((role: any) => ({ value: role._id, label: role._id })), [roles]);
  const [selected, setSelected] = useState<number[]>([]);
  const [roleDraft, setRoleDraft] = useState<Record<number, string>>(() => Object.fromEntries(users.map((user: any) => [user._id, user.role || 'default'])));
  const [bulkRole, setBulkRole] = useState(roleOptions[0]?.value || 'default');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState('');

  useEffect(() => {
    setRoleDraft((prev) => Object.fromEntries(users.map((user: any) => [
      user._id,
      prev[user._id] || user.role || 'default',
    ])));
  }, [users]);

  useEffect(() => {
    if (!roleOptions.some((option) => option.value === bulkRole)) {
      setBulkRole(roleOptions[0]?.value || 'default');
    }
  }, [bulkRole, roleOptions]);

  const selectableUsers = users.filter((user: any) => user._id !== currentUser?._id);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((user: any) => selected.includes(user._id));

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

  const toggle = (uid: number, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, uid] : prev.filter((item) => item !== uid)));
  };

  const saveRoleDrafts = async () => {
    const changed = users.filter((user: any) => roleDraft[user._id] && roleDraft[user._id] !== (user.role || 'default'));
    let saved = false;
    for (const role of roleOptions.map((option) => option.value)) {
      const uids = changed.filter((user: any) => roleDraft[user._id] === role).map((user: any) => user._id);
      if (uids.length) {
        await post({ operation: 'set_users', uids, role, join: false }, t('Saved'), false);
        saved = true;
      }
    }
    if (saved) window.location.reload();
    else notifications.show({ title: t('No changes'), message: '', color: 'blue' });
  };

  const addUsers = async (uids: number[], role: string) => {
    if (!uids.length) {
      notifications.show({ title: t('User ID is required'), message: '', color: 'red' });
      return;
    }
    await post({ operation: 'set_users', uids, role: role || 'default', join: true }, t('Added'));
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Domain Users')}>
        <Button component="a" href={`/d/${domainId}/domain/dashboard`} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
        <Button size="xs" onClick={() => setDialogOpen(true)}>{t('Add User')}</Button>
      </PageHeader>
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
      <AddUserDialog
        opened={dialogOpen}
        onClose={() => setDialogOpen(false)}
        roleOptions={roleOptions}
        defaultRole={roleOptions[0]?.value || 'default'}
        domainId={args.domain?._id || domainId || 'system'}
        onSubmit={addUsers}
        loading={loading === 'set_users'}
      />
    </Stack>
  );
}
