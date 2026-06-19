import { formatErrorMessage } from '@/utils/error';
import { Alert, Badge, Button, Card, Divider, Group, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { TimeDisplay } from '@/components/common/time-display';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

function credentialIdToBase64(input: any) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  const buffer = input.buffer || input;
  if (typeof buffer === 'string') return buffer;
  const values = Array.isArray(buffer) ? buffer : Object.values(buffer || {});
  if (!values.length) return '';
  return btoa(String.fromCharCode(...values.map((value: any) => Number(value))));
}

export default function HomeSecurityPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const sessions = args.sessions || [];
  const authenticators = args.authenticators || [];
  const relations = args.relations || [];
  const loginMethods = args.loginMethods || [];
  const linkedPlatforms = new Set(relations.map((relation: any) => relation.platform));
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [mailPassword, setMailPassword] = useState('');
  const [mail, setMail] = useState('');
  const [showChangeMail, setShowChangeMail] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const postOperation = async (payload: Record<string, any>, successMessage?: string) => {
    setLoading(String(payload.operation || 'operation'));
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/home/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        setError(formatErrorMessage(data.error, t('Failed')));
        return;
      }
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      setSuccess(successMessage || t('Saved'));
      if (payload.operation !== 'change_password' && payload.operation !== 'change_mail' && payload.operation !== 'link_account') {
        window.location.reload();
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading('');
    }
  };

  const handleChangePassword = async () => {
    if (password !== verifyPassword) {
      setError(t('Passwords do not match'));
      return;
    }
    await postOperation({ operation: 'change_password', current, password, verifyPassword }, t('Password changed'));
    setCurrent('');
    setPassword('');
    setVerifyPassword('');
  };

  const handleChangeMail = async () => {
    await postOperation({ operation: 'change_mail', password: mailPassword, mail }, t('Verification mail sent'));
    setMailPassword('');
    setMail('');
    setShowChangeMail(false);
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Security')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}

      {user?.mail?.endsWith('.local') && (
        <Alert color="yellow" variant="light">{t("You haven't set an email.")}</Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card withBorder p="lg" className="hydro-content-card">
          <Title order={4} mb="sm">{t('Change Password')}</Title>
          <Stack gap="md">
            <PasswordInput
              label={args.sudoUid ? t("SuperUser's Password") : t('Current Password')}
              value={current}
              onChange={(e) => setCurrent(e.currentTarget.value)}
            />
            <PasswordInput label={t('New Password')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
            <PasswordInput label={t('Repeat Password')} value={verifyPassword} onChange={(e) => setVerifyPassword(e.currentTarget.value)} />
            <Group justify="flex-end">
              <Button onClick={handleChangePassword} loading={loading === 'change_password'}>{t('Change Password')}</Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="lg" className="hydro-content-card">
          <Group justify="space-between" mb="sm">
            <Title order={4}>{t('Linked Accounts')}</Title>
            <Badge variant="light">{relations.length + 1}</Badge>
          </Group>
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text fw={600}>{t('Email Account')}</Text>
                <Text c="dimmed" size="sm">{user?.mail || '-'}</Text>
              </Stack>
              <Button size="xs" variant="light" onClick={() => setShowChangeMail((value) => !value)}>
                {t('Change')}
              </Button>
            </Group>
            {showChangeMail && (
              <Stack gap="xs">
                <PasswordInput label={t('Current Password')} value={mailPassword} onChange={(e) => setMailPassword(e.currentTarget.value)} />
                <TextInput label={t('New Email')} value={mail} onChange={(e) => setMail(e.currentTarget.value)} />
                <Group justify="flex-end">
                  <Button size="xs" onClick={handleChangeMail} loading={loading === 'change_mail'}>{t('Submit')}</Button>
                </Group>
              </Stack>
            )}
            <Divider />
            {relations.filter((relation: any) => relation.platform !== 'mail').map((relation: any) => {
              const method = loginMethods.find((item: any) => item.id === relation.platform);
              return (
                <Group key={relation.platform} justify="space-between" align="center">
                  <Stack gap={2}>
                    <Text fw={600}>{method?.name || relation.platform}</Text>
                    <Text c="dimmed" size="sm">{relation.id}</Text>
                  </Stack>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => postOperation({ operation: 'unlink_account', platform: relation.platform }, t('Unlinked'))}
                    loading={loading === 'unlink_account'}
                  >
                    {t('Unlink')}
                  </Button>
                </Group>
              );
            })}
            {loginMethods.filter((method: any) => !linkedPlatforms.has(method.id)).map((method: any) => (
              <Group key={method.id} justify="space-between" align="center">
                <Text fw={600}>{method.name || method.id}</Text>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => postOperation({ operation: 'link_account', platform: method.id })}
                  loading={loading === 'link_account'}
                >
                  {t('Link')}
                </Button>
              </Group>
            ))}
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder p="lg" className="hydro-content-card">
        <Group justify="space-between" mb="md">
          <Title order={4}>{t('Authenticators')}</Title>
          <Badge variant="light">{authenticators.length}</Badge>
        </Group>
        <Stack gap="sm">
          {user?.tfa && (
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text fw={600}>{t('Two Factor Authentication')}</Text>
                <Text c="dimmed" size="sm">{t('Authenticator')}</Text>
              </Stack>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() => postOperation({ operation: 'disable_tfa' }, t('Removed'))}
                loading={loading === 'disable_tfa'}
              >
                {t('Remove')}
              </Button>
            </Group>
          )}
          {authenticators.map((authenticator: any, index: number) => {
            const id = credentialIdToBase64(authenticator.credentialID);
            return (
              <Group key={id || index} justify="space-between" align="center">
                <Stack gap={2}>
                  <Text fw={600}>{authenticator.name || t('Authenticator')}</Text>
                  <Text c="dimmed" size="sm">
                    {authenticator.credentialDeviceType || '-'} / {authenticator.fmt || '-'}
                  </Text>
                  {authenticator.regat && <TimeDisplay date={authenticator.regat} />}
                </Stack>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  disabled={!id}
                  onClick={() => postOperation({ operation: 'disable_authn', id }, t('Removed'))}
                  loading={loading === 'disable_authn'}
                >
                  {t('Remove')}
                </Button>
              </Group>
            );
          })}
          {!authenticators.length && !user?.tfa && <Text c="dimmed" size="sm">{t('No authenticators')}</Text>}
        </Stack>
      </Card>

      <Card withBorder p="lg" className="hydro-content-card">
        <Group justify="space-between" mb="md">
          <Title order={4}>{t('Active Sessions')}</Title>
          <Badge variant="light">{sessions.length}</Badge>
        </Group>
        <Stack gap="md">
          {sessions.map((session: any) => (
            <Group key={session._id} justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={4}>
                <Group gap="xs">
                  <Text fw={600}>{session.updateUaInfo?.browser?.name || t('Unknown Browser')}</Text>
                  {session.isCurrent && <Badge size="sm" color="green">{t('Current')}</Badge>}
                </Group>
                <Text c="dimmed" size="sm">
                  {session.updateUaInfo?.os?.name || t('Unknown OS')} {session.updateUaInfo?.os?.version || ''}
                </Text>
                <Text c="dimmed" size="sm">{session.updateIp || session.createIp || '-'}</Text>
                {session.updateAt && <TimeDisplay date={session.updateAt} />}
              </Stack>
              {!session.isCurrent && (
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => postOperation({ operation: 'delete_token', tokenDigest: session._id }, t('Logged out'))}
                  loading={loading === 'delete_token'}
                >
                  {t('Logout This Session')}
                </Button>
              )}
            </Group>
          ))}
          <Divider />
          <Group justify="space-between">
            <Text c="dimmed" size="sm">
              {args.geoipProvider ? `IP geo-location data is provided by ${args.geoipProvider}.` : t('Manage all active login sessions.')}
            </Text>
            <Button
              color="red"
              variant="light"
              onClick={() => postOperation({ operation: 'delete_all_tokens' })}
              loading={loading === 'delete_all_tokens'}
            >
              {t('Logout All Sessions')}
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
