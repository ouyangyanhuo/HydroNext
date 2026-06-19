import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';
import { Avatar, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { PageHeader } from '@/components/common/page-header';
import { UserLink } from '@/components/user/user-link';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useDomain } from '@/hooks/use-domain';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

export default function DomainDashboardPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const domain = useDomain();
  const user = useSessionStore((s) => s.user);
  const ddoc = args.domain || args.ddoc || domain;
  const owner = args.owner;
  const [deleteOpened, setDeleteOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete' }),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else window.location.href = '/home/domain';
    } catch {
      setError('Network error');
    } finally {
      setDeleting(false);
      setDeleteOpened(false);
    }
  };

  const manageLinks = [
    { label: t('Settings'), to: 'domain_edit' },
    { label: t('Join Settings'), to: 'domain_join_applications' },
    { label: t('User Management'), to: 'domain_user' },
    { label: t('Role Management'), to: 'domain_role' },
    { label: t('Permissions'), to: 'domain_permission' },
    { label: t('Groups'), to: 'domain_group' },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Domain Manage')} - ${ddoc.name}`}>
        <Button component={Link} to="domain_edit" params={{ domainId: ddoc._id || 'system' }} size="xs">{t('Settings')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}

      {ddoc.bulletin && (
        <Card withBorder p="lg" className="hydro-content-card">
          <MarkdownRenderer content={ddoc.bulletin} />
        </Card>
      )}

      <Card withBorder p="lg" className="hydro-content-card">
        <Stack gap="md">
          <Text fw={600}>{t('Information')}</Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Group gap="sm">
              <Avatar src={getAvatarUrl(ddoc.avatar)} size="md" radius="xl" />
              <div>
                <Text size="xs" c="dimmed">{t('ID')}</Text>
                <Text size="sm">{ddoc._id}</Text>
              </div>
            </Group>
            <div>
              <Text size="xs" c="dimmed">{t('Name')}</Text>
              <Text size="sm" fw={500}>{ddoc.name}</Text>
            </div>
            {owner && (
              <div>
                <Text size="xs" c="dimmed">{t('Owner')}</Text>
                <UserLink user={owner} size="sm" />
              </div>
            )}
          </SimpleGrid>
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        <Button component={Link} to="homepage" params={{ domainId: ddoc._id || 'system' }} fullWidth variant="light">{t('Visit')}</Button>
        {manageLinks.map((item) => (
          <Button key={item.to} component={Link} to={item.to} params={{ domainId: ddoc._id || 'system' }} fullWidth variant="light">
            {item.label}
          </Button>
        ))}
      </SimpleGrid>

      {owner?._id === user._id && ddoc._id !== 'system' && (
        <Card withBorder p="lg" className="hydro-content-card">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={600}>{t('Delete Domain')}</Text>
              <Text size="sm" c="dimmed">{t('This operation cannot be undone.')}</Text>
            </div>
            <Button color="red" onClick={() => setDeleteOpened(true)}>
              {t('Delete Domain')}
            </Button>
          </Group>
        </Card>
      )}

      <ConfirmDialog
        opened={deleteOpened}
        onClose={() => setDeleteOpened(false)}
        onConfirm={handleDelete}
        title={t('Delete Domain')}
        message={t('Confirm to delete this domain?')}
        confirmLabel={t('Delete')}
        cancelLabel={t('Cancel')}
        loading={deleting}
      />
    </Stack>
  );
}
