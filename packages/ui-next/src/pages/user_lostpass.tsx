import { Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link } from '@/components/link';
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
      if (data.error) setError(data.error.message || 'Failed');
      else setSuccess(t('Password reset email sent. Please check your inbox.'));
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Title order={2} mb="md">{t('Forgot Password')}</Title>
        {error && <Text c="red" size="sm" mb="md">{error}</Text>}
        {success && <Text c="green" size="sm" mb="md">{success}</Text>}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput label={t('Email')} type="email" value={mail} onChange={(e) => setMail(e.currentTarget.value)} required autoFocus />
            <Button type="submit" fullWidth loading={loading}>{t('Send Reset Link')}</Button>
          </Stack>
        </form>
        <Group justify="center" mt="md">
          <Text component={Link} to="user_login" size="sm">{t('Back to Login')}</Text>
        </Group>
      </Paper>
    </div>
  );
}
