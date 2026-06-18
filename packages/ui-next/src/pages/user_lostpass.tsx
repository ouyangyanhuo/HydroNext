import { formatErrorMessage } from '@/utils/error';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Link } from '@/components/link';
import { AuthPanel } from '@/components/auth/auth-panel';
import { useI18n } from '@/hooks/use-i18n';

export default function UserLostpassPage() {
  
  const { t } = useI18n();
  
  const [mail, setMail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/lostpass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mail }),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else setSuccess(t('Password reset email sent. Please check your inbox.'));
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <AuthPanel title={t('Forgot Password')} eyebrow={t('Account')} description={t('Enter your email to receive a reset link.')}>
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput label={t('Email')} type="email" value={mail} onChange={(e) => setMail(e.currentTarget.value)} required autoFocus />
          <Button type="submit" fullWidth loading={loading}>{t('Send Reset Link')}</Button>
        </Stack>
      </form>
      <Group justify="center">
        <Text component={Link} to="user_login" size="sm">{t('Back to Login')}</Text>
      </Group>
    </AuthPanel>
  );
}
