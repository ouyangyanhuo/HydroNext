import { Anchor, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Link } from '@/components/link';
import { AuthPanel } from '@/components/auth/auth-panel';
import { useI18n } from '@/hooks/use-i18n';

export default function UserRegisterPage() {
  const { t } = useI18n();
  const [mail, setMail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mail) return;
    setLoading(true);
    setError('');

    // Use native form submission to follow backend redirect
    // If SMTP is configured: redirects to mail sent page
    // If SMTP is not configured: redirects to /register/{code} for username/password
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/register';
    form.style.display = 'none';

    const input = document.createElement('input');
    input.name = 'mail';
    input.value = mail;
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
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
            onChange={(e) => setMail(e.currentTarget.value)}
            required
            autoFocus
          />
          <Button type="submit" fullWidth loading={loading}>
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
