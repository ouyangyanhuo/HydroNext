import { Badge, Card, Checkbox, Group, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconDeviceFloppy } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

export default function ManageUserEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const profile = args.profile || {};
  const [form, setForm] = useState(() => ({
    bio: String(profile.bio || ''), qq: String(profile.qq || ''), school: String(profile.school || ''),
    studentId: String(profile.studentId || ''), phone: String(profile.phone || ''), resetAvatar: false,
  }));
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const query = new URLSearchParams(window.location.search);
  const page = Number(query.get('page'));
  const backQuery = {
    ...(Number.isSafeInteger(page) && page > 0 ? { page: String(page) } : {}),
    ...(query.get('q') ? { q: query.get('q')! } : {}),
  };
  const backUrl = buildUrl('manage_user', {}, backQuery);

  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, 'Save failed', t));
      if (data.url || data.redirect) {
        const target = new URL(data.url || data.redirect, window.location.href);
        if (target.origin !== window.location.origin || !['http:', 'https:'].includes(target.protocol)) throw new Error(t('Save failed'));
        await navigate(target.pathname + target.search + target.hash);
        return;
      }
      if (!data.saved) throw new Error(t('Save failed'));
      notifications.show({ title: t('Save successfully'), message: '', color: 'green' });
      await navigate(window.location.pathname + window.location.search, { replace: true });
    } catch (error: any) {
      notifications.show({ title: error?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  if (!profile._id) return <Text c="red" role="alert">{t('No users')}</Text>;

  return (
    <Stack gap="lg">
      <PageHeader title={t('Edit user information')}>
        <Button component={Link} href={backUrl} size="xs" variant="default" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
      </PageHeader>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <Stack gap="lg">
            <Card withBorder p="lg" className="hydro-content-card">
              <Group gap="lg" wrap="wrap">
                <UserAvatar
                  user={{ ...profile, avatar: form.resetAvatar ? `gravatar:${profile.mail}` : profile.avatar }}
                  link={false}
                  size={72}
                />
                <Stack gap="xs" className="min-w-0 flex-1">
                  <Group gap="xs">
                    <Text fw="var(--hydro-weight-semibold)">{profile.uname}</Text>
                    <Badge variant="light">{t('User ID')} {profile._id}</Badge>
                  </Group>
                  <Text size="sm" c="dimmed">{t('Changes to this profile apply across all domains.')}</Text>
                  <Checkbox
                    label={t('Restore default avatar')}
                    checked={form.resetAvatar}
                    onChange={(event) => {
                      const resetAvatar = event.currentTarget.checked;
                      setForm((current) => ({ ...current, resetAvatar }));
                    }}
                  />
                  <Text size="xs" c="dimmed">
                    {t('Restores the account avatar to its registration default when saved.')}
                  </Text>
                </Stack>
              </Group>
            </Card>
            <Card withBorder p="lg" className="hydro-content-card">
              <Stack gap="md">
                <Textarea
                  label={t('Bio')}
                  minRows={5}
                  autosize
                  maxRows={12}
                  maxLength={65535}
                  value={form.bio}
                  onChange={(event) => {
                    const bio = event.currentTarget.value;
                    setForm((current) => ({ ...current, bio }));
                  }}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {(['qq', 'school', 'studentId', 'phone'] as const).map((field) => (
                    <TextInput
                      key={field}
                      label={t({ qq: 'QQ', school: 'School', studentId: 'Student ID', phone: 'Phone' }[field])}
                      type={field === 'phone' ? 'tel' : 'text'}
                      maxLength={255}
                      value={form[field]}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setForm((current) => ({ ...current, [field]: value }));
                      }}
                    />
                  ))}
                </SimpleGrid>
                <Group justify="flex-end">
                  <Button type="submit" size="sm" loading={saving} leftSection={<IconDeviceFloppy size={16} />}>
                    {t('Save')}
                  </Button>
                </Group>
              </Stack>
            </Card>
          </Stack>
        </fieldset>
      </form>
    </Stack>
  );
}
