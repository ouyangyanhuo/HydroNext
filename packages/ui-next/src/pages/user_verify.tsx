import { Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function UserVerifyPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Verification failed');
      else navigate('/');
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Title order={2} mb="md">{t('Verify Email')}</Title>
        {error && <Text c="red" size="sm" mb="md">{error}</Text>}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput label={t('Verification Code')} value={code} onChange={(e) => setCode(e.currentTarget.value)} required autoFocus />
            <Button type="submit" fullWidth loading={loading}>{t('Verify')}</Button>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
