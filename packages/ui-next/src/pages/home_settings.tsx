import { Avatar, Badge, Card, FileInput, Group, Radio, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBuildingCommunity, IconSettings, IconUserCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsForm } from '@/components/common/settings-form';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';

const GRAVATAR_MIRROR = '//cravatar.cn/avatar/';

function getAvatarPreviewUrl(type: string, value: string): string {
  if (!value) return `${GRAVATAR_MIRROR}?d=mm&s=128`;
  if (type === 'gravatar') {
    return getAvatarUrl(`gravatar:${value}`, 128);
  }
  if (type === 'qq') {
    return `https://q1.qlogo.cn/g?b=qq&nk=${value}&s=160`;
  }
  if (type === 'github') {
    return `https://github.com/${value}.png?size=128`;
  }
  return value;
}

function parseAvatar(value: string, mail: string) {
  const index = value.indexOf(':');
  if (index <= 0) return { type: 'gravatar', value: mail || '' };
  const provider = value.substring(0, index);
  const providerValue = value.substring(index + 1);
  if (provider === 'gravatar' || provider === 'qq' || provider === 'github' || provider === 'url') {
    return { type: provider, value: providerValue };
  }
  return { type: 'gravatar', value: mail || '' };
}

export default function HomeSettingsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const category = args.category || 'preference';
  const current = args.current || user || {};
  const [loading, setLoading] = useState(false);

  const initialAvatar = parseAvatar(current.avatar || '', current.mail || '');
  const [avatarType, setAvatarType] = useState(() => initialAvatar.type);
  const [avatarValue, setAvatarValue] = useState(() => initialAvatar.value);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarPreviewUrl = useMemo(
    () => (avatarType === 'upload' && avatarFile
      ? URL.createObjectURL(avatarFile)
      : getAvatarPreviewUrl(avatarType, avatarValue)),
    [avatarFile, avatarType, avatarValue],
  );

  useEffect(() => () => {
    if (avatarPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(avatarPreviewUrl);
  }, [avatarPreviewUrl]);

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
    { key: 'preference', label: t('Preference'), icon: IconSettings },
    { key: 'account', label: t('Account'), icon: IconUserCircle },
    { key: 'domain', label: t('Domain'), icon: IconBuildingCommunity },
  ];
  const currentSection = sections.find((section) => section.key === category) || sections[0];

  return (
    <main className="hydro-settings-page">
      <div className="hydro-settings-header">
        <PageHeader title={t('Settings')} />
        <Text size="sm" c="dimmed">{currentSection.label}</Text>
      </div>
      <div className="hydro-settings-layout">
        <nav className="hydro-settings-nav" aria-label={t('Settings')}>
          {sections.map(({ key, label, icon: Icon }) => (
            <a
              key={key}
              href={`/home/settings/${key}`}
              className="hydro-settings-nav__item"
              aria-current={category === key ? 'page' : undefined}
            >
              <Icon size={18} stroke={1.8} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <Stack gap="lg" className="hydro-settings-content">
          {category === 'account' && (
            <Card withBorder p="lg" className="hydro-content-card hydro-settings-avatar">
              <Stack gap="md">
                <div className="hydro-settings-section__header">
                  <Text fw={750}>{t('Avatar')}</Text>
                  <Badge variant="light">{avatarType}</Badge>
                </div>
                <Group gap="xl" align="flex-start" wrap="wrap">
                  <Avatar
                    src={avatarPreviewUrl}
                    size={112}
                    radius="xl"
                    className="hydro-settings-avatar__preview"
                  />
                  <Stack gap="md" className="min-w-64 flex-1">
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
                      <Group gap="xs" className="hydro-settings-avatar__providers">
                        <Radio value="gravatar" label="Cravatar" />
                        <Radio value="qq" label="QQ" />
                        <Radio value="github" label="GitHub" />
                        <Radio value="url" label="URL" />
                        <Radio value="upload" label={t('Upload')} />
                      </Group>
                    </Radio.Group>
                    {avatarType === 'gravatar' && (
                      <TextInput
                        placeholder={t('Email for Cravatar')}
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
                    {avatarType === 'url' && (
                      <TextInput
                        placeholder="https://example.com/avatar.png"
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
                      {t('Cravatar uses your email to fetch avatar from')} cravatar.cn
                    </Text>
                  </Stack>
                </Group>
              </Stack>
            </Card>
          )}
          <SettingsForm
            key={category}
            settings={args.settings || {}}
            current={current}
            payloadMode="flat"
            extraPayload={{ category }}
            loading={loading}
            onSubmit={handleSubmit}
            excludeKeys={category === 'account' ? ['avatar'] : []}
            variant="personal"
          />
        </Stack>
      </div>
    </main>
  );
}
