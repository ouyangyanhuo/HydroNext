import { Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { AuthPanel } from '@/components/auth/auth-panel';
import { Button } from '@/components/common/button';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';

export default function UserLostpassPage() {
  const { t } = useI18n();
  const enabled = useSessionStore((s) => s.ui.passwordResetEnabled === true);
  const [mail, setMail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enabled || loading) return;
    setLoading(true);
    try {
      const response = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mail: mail.trim() }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        notifications.show({ color: 'red', message: t(formatErrorMessage(data.error, 'Failed')) });
      } else {
        setSent(true);
      }
    } catch {
      notifications.show({ color: 'red', message: t('Network error') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPanel title={t(sent ? 'Email Sent' : 'Forgot Password')}>
      {!enabled ? (
        <Text role="status" ta="center">{t('Please contact the administrator')}</Text>
      ) : sent ? (
        <Text role="status" ta="center">{t('A password reset link has been sent to your email. Please check your inbox.')}</Text>
      ) : (
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label={t('Email')}
              type="email"
              autoComplete="email"
              value={mail}
              onChange={(event) => setMail(event.currentTarget.value)}
              required
              autoFocus
            />
            <Button type="submit" fullWidth loading={loading}>{t('Send Reset Link')}</Button>
          </Stack>
        </form>
      )}
      <Button component={Link} to="user_login" variant="light" fullWidth>
        {t('Back to Login')}
      </Button>
    </AuthPanel>
  );
}
