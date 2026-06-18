import { Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function UserRegisterWithCodePage() {
  
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uname, setUname] = useState('');
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
        body: JSON.stringify({ uname, password }),
      });
      const data = await res.json();
      if (data.error) setError(data.error.message || 'Failed');
      else navigate('/');
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Title order={2} mb="md">{t('Register')}</Title>
        {error && <Text c="red" size="sm" mb="md">{error}</Text>}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput label={t('Username')} value={uname} onChange={(e) => setUname(e.currentTarget.value)} required />
            <PasswordInput label={t('Password')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
            <Button type="submit" fullWidth loading={loading}>{t('Register')}</Button>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
