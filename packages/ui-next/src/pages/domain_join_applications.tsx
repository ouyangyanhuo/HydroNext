import { Button, Card, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
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
  const buildUrl = useBuildUrl();
  const storeDomainId = useSessionStore((s) => s.ui.domainId);
  const domainId = args.domain?._id || args.domainId || storeDomainId || window.location.pathname.split('/')[2] || 'system';
  const joinSettings = args.joinSettings || null;
  const roleOptions = optionData(args.rolesWithText || []);
  const [form, setForm] = useState({
    method: String(joinSettings?.method ?? 0),
    role: joinSettings?.role || roleOptions[0]?.value || '',
    group: joinSettings?.group || '',
    invitationCode: args.invitationCode || joinSettings?.code || '',
  });
  const [loading, setLoading] = useState(false);

  const joinUrl = new URL(buildUrl('domain_join', { domainId }), window.location.origin).toString();
  const codeUrl = form.method === '2' && form.invitationCode
    ? `${joinUrl}?code=${encodeURIComponent(form.invitationCode)}`
    : '';

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

      {Number(joinSettings?.method) === 2 && form.method === '2' && codeUrl && (
        <Card withBorder p="lg" className="hydro-content-card">
          <Title order={4} mb="sm">{t('Information')}</Title>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">{t('User can join this domain by visiting the following URL')}:</Text>
            <TextInput value={codeUrl} readOnly />
            <Text size="xs" c="dimmed">{t('This invitation link never expires.')}</Text>
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
            onChange={(e) => {
              const group = e.currentTarget.value;
              setForm((prev) => ({ ...prev, group }));
            }}
          />
          {form.method === '2' && (
            <TextInput
              label={t('Invitation Code')}
              description={t('A unique invitation code of up to 8 characters is generated automatically.')}
              value={form.invitationCode}
              readOnly
            />
          )}
          <Group justify="flex-end">
            <Button onClick={handleSave} loading={loading}>{t('Update Settings')}</Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
