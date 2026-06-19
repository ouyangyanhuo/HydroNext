import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';
import { Avatar, Button, Card, Group, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

export default function HomeDomainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const [loadingId, setLoadingId] = useState('');
  const [error, setError] = useState('');
  
  const ddocs = args.ddocs || [];
  const roles = args.role || {};
  const canManage = args.canManage || {};
  const pinned = useMemo(() => new Set<string>(user.pinnedDomains || []), [user.pinnedDomains]);

  const run = async (payload: Record<string, any>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setLoadingId(payload.id || payload.operation);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else window.location.reload();
    } catch {
      setError('Network error');
    } finally {
      setLoadingId('');
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('My Domains')}>
        <Button component={Link} to="domain_create" size="xs">{t('Create Domain')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
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
                          {canLeave && (
                            <Button
                              size="compact-xs"
                              color="red"
                              variant="subtle"
                              loading={busy}
                              onClick={() => run({ operation: 'leave', id: d._id }, t('Confirm to leave this domain?'))}
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
    </Stack>
  );
}
