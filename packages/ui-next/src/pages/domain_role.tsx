import { Badge, Checkbox, Group, Paper, Stack, Table, Text } from '@mantine/core';
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

const BUILTIN_ROLES = new Set(['root', 'default', 'guest']);

export default function DomainRolePage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const domainId = useSessionStore((s) => s.ui.domainId);
  const roles = Array.isArray(args.roles) ? args.roles : Object.entries(args.roles || {}).map(([id, role]: [string, any]) => ({
    _id: id,
    ...(typeof role === 'object' ? role : { perm: role }),
  }));
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const post = async (payload: Record<string, any>, successMessage: string) => {
    setLoading(String(payload.operation || 'operation'));
    setError('');
    setSuccess('');
    try {
      await postJsonRequest(window.location.href, payload,
        (requestError) => formatErrorMessage(requestError, 'Operation failed', t), { redirects: 'authorization' });
      setSuccess(successMessage);
      window.location.reload();
    } catch (err: any) {
      setError(t(err?.message || 'Network error'));
    } finally {
      setLoading('');
    }
  };

  const toggle = (role: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, role] : prev.filter((item) => item !== role)));
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Roles')}>
        <Button component={Link} href={`/d/${domainId}/domain/dashboard`} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
        <Button size="xs" onClick={() => setDialogOpen(true)}>{t('Create Role')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}
      <Paper withBorder>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={48}>
                <Checkbox
                  aria-label={t('Select All')}
                  checked={roles.some((role: any) => !BUILTIN_ROLES.has(role._id))
                    && roles.filter((role: any) => !BUILTIN_ROLES.has(role._id)).every((role: any) => selected.includes(role._id))}
                  onChange={(e) => setSelected(e.currentTarget.checked
                    ? roles.filter((role: any) => !BUILTIN_ROLES.has(role._id)).map((role: any) => role._id)
                    : [])}
                />
              </Table.Th>
              <Table.Th>{t('Role')}</Table.Th>
              <Table.Th>{t('Users')}</Table.Th>
              <Table.Th>{t('Type')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {roles.map((role: any) => (
              <Table.Tr key={role._id}>
                <Table.Td>
                  <Checkbox
                    aria-label={role._id}
                    disabled={BUILTIN_ROLES.has(role._id)}
                    checked={selected.includes(role._id)}
                    onChange={(e) => toggle(role._id, e.currentTarget.checked)}
                  />
                </Table.Td>
                <Table.Td><Badge variant="light">{role._id}</Badge></Table.Td>
                <Table.Td><Text size="sm">{role.count ?? '--'}</Text></Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{BUILTIN_ROLES.has(role._id) ? t('Built-in') : t('User-defined role')}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="flex-end" p="md">
          <Button
            color="red"
            variant="light"
            disabled={!selected.length}
            loading={loading === 'delete'}
            onClick={() => post({ operation: 'delete', roles: selected }, t('Deleted'))}
          >
            {t('Delete Selected Roles')}
          </Button>
        </Group>
      </Paper>
      <FormDialog
        opened={dialogOpen}
        title={t('Create Role')}
        fields={[{
          name: 'role',
          label: t('Name'),
          required: true,
          placeholder: 'role_name',
        }]}
        onClose={() => setDialogOpen(false)}
        onSubmit={(values) => post({ operation: 'add', role: values.role }, t('Created'))}
        confirmLabel={t('Create')}
        cancelLabel={t('Cancel')}
        loading={loading === 'add'}
        error={error}
      />
    </Stack>
  );
}
