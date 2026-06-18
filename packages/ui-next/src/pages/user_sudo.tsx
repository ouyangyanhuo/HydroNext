import { Button, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function UserSudoPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const redirect = args.redirect || '/';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Failed');
      else navigate(redirect);
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Title order={2} mb="md">{t('Sudo Mode')}</Title>
        <Text size="sm" c="dimmed" mb="md">{t('Please enter your password to continue.')}</Text>
        {error && <Text c="red" size="sm" mb="md">{error}</Text>}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <PasswordInput label={t('Password')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required autoFocus />
            <Button type="submit" fullWidth loading={loading}>{t('Confirm')}</Button>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
