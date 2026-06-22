import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Group, Modal, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh, IconSearch, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';

interface ManagedUser {
  _id: number;
  uname: string;
  mail?: string;
  priv?: number;
  regat?: string;
  loginat?: string;
  loginip?: string;
}

export default function ManageUserPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const users: ManagedUser[] = args.udocs || [];
  const page = args.page || 1;
  const totalPages = args.upcount || 1;
  const totalUsers = args.ucount || users.length;
  const initialQuery = args.q || '';
  const [query, setQuery] = useState(initialQuery);
  const [dialogUser, setDialogUser] = useState<ManagedUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);
  const [password, setPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pageUrl = useMemo(() => buildUrl('manage_user', {}, initialQuery ? { q: initialQuery } : {}), [buildUrl, initialQuery]);
  const isProtectedUser = (user: ManagedUser) => user._id <= 0 || user._id === 1 || user.priv === -1;
  const isBannedUser = (user: ManagedUser) => user.priv === 0;

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const search = () => {
    const nextQuery = query.trim();
    navigate(buildUrl('manage_user', {}, nextQuery ? { q: nextQuery } : {}));
  };

  const openResetDialog = (user: ManagedUser) => {
    setDialogUser(user);
    setPassword('');
    setVerifyPassword('');
  };

  const openDeleteDialog = (user: ManagedUser) => {
    setDeleteUser(user);
  };

  const submitReset = async () => {
    if (!dialogUser) return;
    if (password !== verifyPassword) {
      notifications.show({ title: t('Passwords do not match'), message: '', color: 'red' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'reset_password', uid: dialogUser._id, password }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) notifications.show({ title: formatErrorMessage(data.error, t('Password reset failed')), message: '', color: 'red' });
      else {
        notifications.show({ title: t('Password reset'), message: '', color: 'green' });
        setDialogUser(null);
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete_user', uid: deleteUser._id }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) notifications.show({ title: formatErrorMessage(data.error, t('Ban failed')), message: '', color: 'red' });
      else {
        notifications.show({ title: t('User banned'), message: '', color: 'green' });
        setDeleteUser(null);
        window.location.reload();
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: '_id',
      title: t('User ID'),
      width: 90,
      render: (user: ManagedUser) => <Text size="sm" fw={700}>{user._id}</Text>,
    },
    {
      key: 'user',
      title: t('User'),
      render: (user: ManagedUser) => <UserLink user={user} size="sm" />,
    },
    {
      key: 'mail',
      title: t('Email'),
      render: (user: ManagedUser) => <Text size="sm" c={user.mail ? undefined : 'dimmed'}>{user.mail || '-'}</Text>,
    },
    {
      key: 'priv',
      title: t('Privilege'),
      width: 120,
      align: 'right' as const,
      render: (user: ManagedUser) => (
        isBannedUser(user)
          ? <Badge color="red" variant="light">{t('Banned')}</Badge>
          : <Text size="xs" ff="monospace">{user.priv ?? '-'}</Text>
      ),
    },
    {
      key: 'loginat',
      title: t('Last Login'),
      width: 140,
      render: (user: ManagedUser) => (user.loginat ? <TimeDisplay date={user.loginat} /> : <Text size="xs" c="dimmed">-</Text>),
    },
    {
      key: 'loginip',
      title: t('Login IP'),
      width: 130,
      render: (user: ManagedUser) => <Text size="xs" c="dimmed" ff="monospace">{user.loginip || '-'}</Text>,
    },
    {
      key: 'action',
      title: t('Actions'),
      width: 240,
      align: 'right' as const,
      render: (user: ManagedUser) => (
        <Group gap={4} justify="flex-end">
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconRefresh size={14} />}
            onClick={() => openResetDialog(user)}
            disabled={isProtectedUser(user)}
          >
            {t('Reset Password')}
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => openDeleteDialog(user)}
            disabled={isProtectedUser(user) || isBannedUser(user)}
          >
            {t('Ban User')}
          </Button>
        </Group>
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={t('User Management')}>
        <Badge variant="light">{t('Total')}: {totalUsers}</Badge>
      </PageHeader>

      <Card withBorder p="lg" className="hydro-content-card">
        <Group justify="space-between" align="flex-end" mb="md" wrap="wrap">
          <Stack gap={2}>
            <Title order={3} size="h4">{t('All Users')}</Title>
            <Text size="sm" c="dimmed">{t('View users and reset passwords')}</Text>
          </Stack>
          <Group gap="xs">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search();
              }}
              placeholder={t('Search users by username, UID or email')}
              leftSection={<IconSearch size={16} />}
              w={{ base: 240, sm: 320 }}
            />
            <Button size="xs" leftSection={<IconSearch size={14} />} onClick={search}>{t('Search')}</Button>
            {initialQuery && (
              <Button component={Link} to="manage_user" size="xs" variant="default">
                {t('Clear Search')}
              </Button>
            )}
          </Group>
        </Group>

        <DataTable
          columns={columns}
          data={users}
          emptyMessage={t('No users')}
        />
        <Paginator page={page} totalPages={totalPages} baseUrl={pageUrl} />
      </Card>

      <Modal
        opened={!!dialogUser}
        title={dialogUser ? `${t('Reset Password')} #${dialogUser._id}` : t('Reset Password')}
        onClose={() => setDialogUser(null)}
      >
        <Stack gap="md">
          {dialogUser && (
            <Text size="sm">
              {t('Reset password for')} <Text component="span" fw={700}>{dialogUser.uname}</Text>
            </Text>
          )}
          <PasswordInput
            label={t('New Password')}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
            autoFocus
          />
          <PasswordInput
            label={t('Confirm Password')}
            value={verifyPassword}
            onChange={(e) => setVerifyPassword(e.currentTarget.value)}
            required
          />
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setDialogUser(null)}>{t('Cancel')}</Button>
            <Button size="xs" onClick={submitReset} loading={loading}>{t('Submit')}</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!deleteUser}
        title={deleteUser ? `${t('Ban User')} #${deleteUser._id}` : t('Ban User')}
        onClose={() => setDeleteUser(null)}
      >
        <Stack gap="md">
          {deleteUser && (
            <Text size="sm">
              {t('Ban user confirmation')} <Text component="span" fw={700}>{deleteUser.uname}</Text>
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setDeleteUser(null)}>{t('Cancel')}</Button>
            <Button color="red" size="xs" onClick={submitDelete} loading={deleting}>{t('Ban User')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
