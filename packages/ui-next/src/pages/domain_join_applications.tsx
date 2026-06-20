import { Alert, Button, Card, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { usePageData } from '@/context/page-data';
import { useSessionStore } from '@/stores/session';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

const JOIN_METHOD_RANGE = [
  { value: '0', label: 'No user is allowed to join this domain' },
  { value: '1', label: 'Any user is allowed to join this domain' },
  { value: '2', label: 'Any user is allowed to join this domain with an invitation code' },
];

function optionData(range: any) {
  if (Array.isArray(range)) {
    return range.map((item) => (Array.isArray(item)
      ? { value: String(item[0]), label: String(item[1] ?? item[0]) }
      : { value: String(item), label: String(item) }));
  }
  return Object.entries(range || {}).map(([value, label]) => ({ value: String(value), label: String(label) }));
}

export default function DomainJoinApplicationsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const storeDomainId = useSessionStore((s) => s.ui.domainId);
  const domainId = args.domain?._id || args.domainId || storeDomainId || window.location.pathname.split('/')[2] || 'system';
  const joinSettings = args.joinSettings || null;
  const roleOptions = optionData(args.rolesWithText || []);
  const expireOptions = optionData(args.expirations || {});
  const [form, setForm] = useState({
    method: String(joinSettings?.method ?? 0),
    role: joinSettings?.role || roleOptions[0]?.value || '',
    group: joinSettings?.group || '',
    expire: expireOptions[0]?.value || '0',
    invitationCode: joinSettings?.code || '',
  });
  const [loading, setLoading] = useState(false);

  const joinUrl = `${args.url_prefix || '/'}d/${domainId}/domain/join`;
  const codeUrl = form.invitationCode ? `${joinUrl}?code=${encodeURIComponent(form.invitationCode)}` : '';

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          method: Number(form.method),
          role: form.role,
          group: form.group,
          expire: Number(form.expire),
          invitationCode: form.invitationCode,
        }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Save failed')), message: '', color: 'red' });
      } else if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        notifications.show({ title: t('Saved'), message: '', color: 'green' });
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Join Applications')}>
        <Button component="a" href={`/d/${domainId}/domain/dashboard`} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
        <Button onClick={handleSave} loading={loading} size="xs">{t('Update Settings')}</Button>
      </PageHeader>

      {joinSettings && (
        <Card withBorder p="lg" className="hydro-content-card">
          <Title order={4} mb="sm">{t('Information')}</Title>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">{t('User can join this domain by visiting the following URL')}:</Text>
            <TextInput value={joinUrl} readOnly />
            {joinSettings.method === 2 && codeUrl && (
              <>
                <Text size="sm" c="dimmed">{t('Or, with automatically filled invitation code')}:</Text>
                <TextInput value={codeUrl} readOnly />
              </>
            )}
            {joinSettings.expire && (
              <Alert color="blue" variant="light">
                <Group gap="xs">
                  <Text size="sm">{t('The link will be expired at {0}')}:</Text>
                  <TimeDisplay date={joinSettings.expire} format="absolute" size="sm" />
                </Group>
              </Alert>
            )}
          </Stack>
        </Card>
      )}

      <Card withBorder p="lg" className="hydro-content-card">
        <Title order={4} mb="md">{t('Settings')}</Title>
        <Stack gap="md">
          <Select
            label={t('Method')}
            data={JOIN_METHOD_RANGE.map((item) => ({ ...item, label: t(item.label) }))}
            value={form.method}
            onChange={(value) => setForm((prev) => ({ ...prev, method: value || '0' }))}
          />
          <Select
            label={t('Role Assignment')}
            description={t('The role to assign when user joining the domain.')}
            data={roleOptions}
            value={form.role}
            disabled={form.method === '0'}
            onChange={(value) => setForm((prev) => ({ ...prev, role: value || '' }))}
          />
          <TextInput
            label={t('Group Assignment (Optional)')}
            description={t('The group to join when user joining the domain.')}
            value={form.group}
            disabled={form.method === '0'}
            onChange={(e) => setForm((prev) => ({ ...prev, group: e.currentTarget.value }))}
          />
          <Select
            label={t('Expire')}
            description={t('User will no longer be allowed to join the domain after expiration.')}
            data={expireOptions}
            value={form.expire}
            disabled={form.method === '0'}
            onChange={(value) => setForm((prev) => ({ ...prev, expire: value || '0' }))}
          />
          <TextInput
            label={t('Invitation Code')}
            description={t('The invitation code to enter to successfully join the domain. You can only use letters and numbers in the code and it should not be longer than 64 characters.')}
            value={form.invitationCode}
            disabled={form.method !== '2'}
            onChange={(e) => setForm((prev) => ({ ...prev, invitationCode: e.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button onClick={handleSave} loading={loading}>{t('Update Settings')}</Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
