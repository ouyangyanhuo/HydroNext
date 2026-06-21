import { Anchor, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { AuthPanel } from '@/components/auth/auth-panel';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function UserRegisterPage() {
  const { t } = useI18n();
  const [mail, setMail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mail) return;

    if (!EMAIL_REGEX.test(mail)) {
      setEmailError(t('Invalid email format'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('mail', mail);
      const res = await fetch(window.location.href, {
        method: 'POST',
        body: formData,
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = await res.json();
        if (data.error) {
          setError(data.error.message || data.error || t('Registration failed'));
        } else if (data.redirect) {
          window.location.href = data.redirect;
        }
      } else if (res.redirected) {
        window.location.href = res.url;
      } else if (res.ok) {
        window.location.reload();
      }
    } catch {
      setError(t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPanel title={t('Register')} eyebrow={t('Account')} description={t('Create an account to start solving problems.')}>
      {error && (
        <Text c="red" size="sm">{error}</Text>
      )}

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
