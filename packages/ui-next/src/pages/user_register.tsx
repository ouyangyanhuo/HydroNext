import { Anchor, Group, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { AuthPanel } from '@/components/auth/auth-panel';
import { Button } from '@/components/common/button';
import { Link } from '@/components/link';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function UserRegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const enabled = useSessionStore((s) => s.ui.registrationEnabled !== false);
  const [mail, setMail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  const validateEmail = (value: string) => {
    if (!value) {
      setEmailError('');
      return;
    }
    if (!EMAIL_REGEX.test(value)) {
      setEmailError(t('Invalid email format'));
    } else {
      setEmailError('');
    }
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!enabled || loading || !mail) return;

    if (!EMAIL_REGEX.test(mail)) {
      setEmailError(t('Invalid email format'));
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('mail', mail);
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        notifications.show({ color: 'red', message: t(formatErrorMessage(data.error, 'Registration failed')) });
      } else if (data.url || data.redirect) {
        navigate(data.url || data.redirect);
      } else if (data.verificationEmailSent) {
        setSent(true);
      } else {
        notifications.show({ color: 'red', message: t('Registration failed') });
      }
    } catch {
      notifications.show({ color: 'red', message: t('Network error') });
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) {
    return (
      <AuthPanel title={t('Register')}>
        <Text role="status" ta="center">{t('Public registration is disabled. Please contact a system administrator.')}</Text>
        <Button component={Link} to="user_login" variant="light" fullWidth>{t('Back to Login')}</Button>
      </AuthPanel>
    );
  }

  if (sent) {
    return (
      <AuthPanel title={t('Verification Email Sent')}>
        <Text role="status" ta="center">
          {t('A verification link has been sent to your email. Please check your inbox to complete registration.')}
        </Text>
        <Button component={Link} to="user_login" variant="light" fullWidth>{t('Back to Login')}</Button>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel title={t('Register')} description={t('Create an account to start solving problems.')}>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label={t('Email')}
            type="email"
            value={mail}
            onChange={(e) => {
              setMail(e.currentTarget.value);
              validateEmail(e.currentTarget.value);
            }}
            error={emailError}
            required
            autoFocus
          />
          <Button type="submit" fullWidth loading={loading} disabled={!!emailError}>
            {t('Continue')}
          </Button>
        </Stack>
      </form>

      <Group justify="center">
        <Anchor component={Link} to="user_login" size="sm">
          {t('Already have an account? Login')}
        </Anchor>
      </Group>
    </AuthPanel>
  );
}
