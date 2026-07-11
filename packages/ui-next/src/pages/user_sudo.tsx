import { Button, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconKey, IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { verifyWithWebAuthn } from '@/components/auth/authenticator';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';

export default function UserSudoPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);
  const redirect = args.redirect || '/';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<'password' | 'tfa'>(() => (user?.tfa ? 'tfa' : 'password'));
  const [tfa, setTfa] = useState('');
  const [authnLoading, setAuthnLoading] = useState(false);

  const submitVerification = async (payload: Record<string, any>) => {
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (data.error) notifications.show({ title: formatErrorMessage(data.error, t('Failed')), message: '', color: 'red' });
      else navigate(data.redirect || redirect);
    } catch { notifications.show({ title: t('Network error'), message: '', color: 'red' }); } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitVerification(method === 'tfa' ? { tfa } : { password });
  };

  const handleWebAuthn = async () => {
    setAuthnLoading(true);
    try {
      const authnChallenge = await verifyWithWebAuthn(t);
      await submitVerification({ authnChallenge });
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Verification failed'), message: '', color: 'red' });
    } finally {
      setAuthnLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Title order={2} mb="md">{t('Sudo Mode')}</Title>
        <Text size="sm" c="dimmed" mb="md">{t('Please enter your password to continue.')}</Text>
        {(user?.authn || user?.tfa) && (
          <Group gap="xs" mb="md" grow>
            {user?.authn && (
              <Button
                variant="light"
                leftSection={<IconKey size={16} />}
                loading={authnLoading}
                onClick={handleWebAuthn}
              >
                {t('Use Authenticator')}
              </Button>
            )}
            {user?.tfa && (
              <Button variant={method === 'tfa' ? 'filled' : 'light'} onClick={() => setMethod('tfa')}>
                {t('Use TFA Code')}
              </Button>
            )}
            <Button
              variant={method === 'password' ? 'filled' : 'light'}
              leftSection={<IconLock size={16} />}
              onClick={() => setMethod('password')}
            >
              {t('Use Password')}
            </Button>
          </Group>
        )}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            {method === 'tfa' ? (
              <TextInput
                label={t('6-Digit Code')}
                value={tfa}
                onChange={(event) => setTfa(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
              />
            ) : (
              <PasswordInput label={t('Password')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required autoFocus />
            )}
            <Button type="submit" fullWidth loading={loading}>{t('Confirm')}</Button>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
