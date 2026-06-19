import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';
import { Avatar, Button, Card, Group, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { usePermission, PRIV } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';

export default function HomeDomainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const { hasPriv } = usePermission();
  const [loadingId, setLoadingId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);

  const ddocs = args.ddocs || [];
  const roles = args.role || {};
  const canManage = args.canManage || {};
  const pinned = useMemo(() => new Set<string>(user.pinnedDomains || []), [user.pinnedDomains]);

  const canCreateDomain = hasPriv(PRIV.PRIV_CREATE_DOMAIN);
  const canDeleteDomain = hasPriv(PRIV.PRIV_DELETE_DOMAIN) || hasPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN);

  const run = async (payload: Record<string, any>) => {
    setLoadingId(payload.id || payload.operation);
    try {
      const res = await fetch('/home/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Failed')), message: '', color: 'red' });
      } else if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        window.location.reload();
      }
    } catch {
      notifications.show({ title: t('Network error'), message: '', color: 'red' });
    } finally {
      setLoadingId('');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoadingId(deleteTarget);
    setDeleteTarget(null);
    try {
      const res = await fetch(`/d/${deleteTarget}/domain/dashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete' }),
      });
      const data = await res.json();
      if (data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Failed')), message: '', color: 'red' });
      } else if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        window.location.reload();
      }
    } catch {
      notifications.show({ title: t('Network error'), message: '', color: 'red' });
    } finally {
      setLoadingId('');
    }
  };

  const handleLeave = async () => {
    if (!leaveTarget) return;
    await run({ operation: 'leave', id: leaveTarget });
    setLeaveTarget(null);
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('My Domains')}>
        {canCreateDomain && (
          <Button component="a" href="/home/domain/create" size="xs">{t('Create Domain')}</Button>
        )}
      </PageHeader>
      {ddocs.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">{t('No domains')}</Text>
      ) : (
        <Card withBorder p={0} className="hydro-content-card overflow-hidden">
          <ScrollArea>
            <Table striped highlightOnHover miw={760}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('Name')} ({t('ID')})</Table.Th>
                  <Table.Th>{t('My Role')}</Table.Th>
                  <Table.Th ta="right">{t('Action')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {ddocs.map((d: any) => {
                  const isPinned = pinned.has(d._id);
                  const canLeave = d._id !== 'system' && d.owner !== user._id;
                  const canDelete = canDeleteDomain && d._id !== 'system';
                  const busy = loadingId === d._id;
                  return (
                    <Table.Tr key={d._id}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <Avatar src={getAvatarUrl(d.avatar)} size="sm" radius="xl" />
                          <div>
                            <Text fw={500} size="sm">{d.name}</Text>
                            <Text size="xs" c="dimmed">{d._id}</Text>
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{roles[d._id] || 'default'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group justify="flex-end" gap="xs" wrap="nowrap">
                          <Button component={Link} to="homepage" params={{ domainId: d._id }} size="compact-xs" variant="subtle">
                            {t('Visit')}
                          </Button>
                          {canManage[d._id] && (
                            <Button component={Link} to="domain_dashboard" params={{ domainId: d._id }} size="compact-xs" variant="subtle">
                              {t('Manage')}
                            </Button>
                          )}
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            loading={busy}
                            onClick={() => run({ operation: 'star', id: d._id, star: !isPinned })}
                          >
                            {isPinned ? t('Unpin') : t('Pin')}
                          </Button>
                          {canDelete && (
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="subtle"
                              loading={busy}
                              onClick={() => setDeleteTarget(d._id)}
                            >
                              {t('Delete')}
                            </Button>
                          )}
                          {canLeave && (
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="subtle"
                              loading={busy}
                              onClick={() => setLeaveTarget(d._id)}
                            >
                              {t('Leave')}
                            </Button>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      <ConfirmDialog
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('Delete Domain')}
        message={t('Confirm to delete this domain?')}
        confirmLabel={t('Delete')}
        cancelLabel={t('Cancel')}
        loading={loadingId === deleteTarget}
      />

      <ConfirmDialog
        opened={!!leaveTarget}
        onClose={() => setLeaveTarget(null)}
        onConfirm={handleLeave}
        title={t('Leave Domain')}
        message={t('Confirm to leave this domain?')}
        confirmLabel={t('Leave')}
        cancelLabel={t('Cancel')}
        loading={loadingId === leaveTarget}
      />
    </Stack>
  );
}
