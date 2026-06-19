import { formatErrorMessage } from '@/utils/error';
import { Avatar, Badge, Button, Card, FileInput, Group, Radio, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsForm } from '@/components/common/settings-form';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

const GRAVATAR_MIRROR = '//cn.gravatar.com/avatar/';

function getAvatarPreviewUrl(type: string, value: string): string {
  if (!value) return `${GRAVATAR_MIRROR}?d=mm&s=128`;
  if (type === 'gravatar') {
    return `${GRAVATAR_MIRROR}${value}?d=mm&s=128`;
  }
  if (type === 'qq') {
    return `https://q1.qlogo.cn/g?b=qq&nk=${value}&s=160`;
  }
  if (type === 'github') {
    return `https://github.com/${value}.png?size=128`;
  }
  return value;
}

export default function HomeSettingsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const category = args.category || 'preference';
  const current = args.current || user || {};
  const [loading, setLoading] = useState(false);

  const [avatarType, setAvatarType] = useState('gravatar');
  const [avatarValue, setAvatarValue] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    const avatar = current.avatar || '';
    const index = avatar.indexOf(':');
    if (index > 0) {
      const provider = avatar.substring(0, index);
      const value = avatar.substring(index + 1);
      if (provider === 'gravatar' || provider === 'qq' || provider === 'github') {
        setAvatarType(provider);
        setAvatarValue(value);
      } else if (provider === 'url') {
        setAvatarType('url');
        setAvatarValue(value);
      } else {
        setAvatarType('gravatar');
        setAvatarValue('');
      }
    } else {
      setAvatarType('gravatar');
      setAvatarValue('');
    }
  }, [current.avatar]);

  const handleSubmit = async (payload: Record<string, any>) => {
    setLoading(true);
    try {
      if (category === 'account') {
        if (avatarType === 'upload' && avatarFile) {
          const formData = new FormData();
          formData.append('file', avatarFile);
          const uploadRes = await fetch('/home/avatar', {
            method: 'POST',
            body: formData,
          });
          if (!uploadRes.ok) {
            const data = await uploadRes.json().catch(() => ({}));
            throw new Error(data.error?.message || 'Upload failed');
          }
        } else if (avatarType !== 'upload') {
          const avatarRes = await fetch('/home/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ avatar: `${avatarType}:${avatarValue}` }),
          });
          if (!avatarRes.ok) {
            const data = await avatarRes.json().catch(() => ({}));
            throw new Error(data.error?.message || 'Update failed');
          }
        }
        delete payload.avatar;
      }
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Save failed')), message: '', color: 'red' });
      } else if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        notifications.show({ title: t('Settings saved'), message: '', color: 'green' });
        if (category === 'account') window.location.reload();
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    ['preference', t('Preference')],
    ['account', t('Account')],
    ['domain', t('Domain')],
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={t('Settings')}>
        <Group gap="xs">
          {sections.map(([key, label]) => (
            <Button
              key={key}
              component="a"
              href={`/home/settings/${key}`}
              variant={category === key ? 'filled' : 'light'}
              size="xs"
            >
              {label}
            </Button>
          ))}
        </Group>
      </PageHeader>
      {category === 'account' && (
        <Card withBorder p="lg" className="hydro-content-card">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={700}>{t('Avatar')}</Text>
              <Badge variant="light">{avatarType}</Badge>
            </Group>
            <Group gap="lg" align="flex-start">
              <Avatar
                src={avatarType === 'upload' && avatarFile ? URL.createObjectURL(avatarFile) : getAvatarPreviewUrl(avatarType, avatarValue)}
                size={96}
                radius="xl"
              />
              <Stack gap="sm" className="flex-1">
                <Radio.Group
                  value={avatarType}
                  onChange={(value) => {
                    setAvatarType(value);
                    if (value === 'upload') {
                      setAvatarValue('');
                    } else if (value === 'gravatar') {
                      setAvatarValue(current.mail || '');
                    } else {
                      setAvatarValue('');
                    }
                  }}
                >
                  <Group gap="md">
                    <Radio value="gravatar" label="Gravatar" />
                    <Radio value="qq" label="QQ" />
                    <Radio value="github" label="GitHub" />
                    <Radio value="upload" label={t('Upload')} />
                  </Group>
                </Radio.Group>
                {avatarType === 'gravatar' && (
                  <TextInput
                    placeholder={t('Email for Gravatar')}
                    value={avatarValue}
                    onChange={(e) => setAvatarValue(e.currentTarget.value)}
                    size="sm"
                  />
                )}
                {avatarType === 'qq' && (
                  <TextInput
                    placeholder={t('QQ Number')}
                    value={avatarValue}
                    onChange={(e) => setAvatarValue(e.currentTarget.value)}
                    size="sm"
                  />
                )}
                {avatarType === 'github' && (
                  <TextInput
                    placeholder={t('GitHub Username')}
                    value={avatarValue}
                    onChange={(e) => setAvatarValue(e.currentTarget.value)}
                    size="sm"
                  />
                )}
                {avatarType === 'upload' && (
                  <FileInput
                    placeholder={t('Choose avatar file')}
                    accept="image/*"
                    value={avatarFile}
                    onChange={setAvatarFile}
                    size="sm"
                  />
                )}
                <Text size="xs" c="dimmed">
                  {t('Gravatar uses your email to fetch avatar from')} cn.gravatar.com
                </Text>
              </Stack>
            </Group>
          </Stack>
        </Card>
      )}
      <SettingsForm
        settings={args.settings || {}}
        current={current}
        payloadMode="flat"
        extraPayload={{ category }}
        loading={loading}
        onSubmit={handleSubmit}
        excludeKeys={category === 'account' ? ['avatar'] : []}
      />
    </Stack>
  );
}
