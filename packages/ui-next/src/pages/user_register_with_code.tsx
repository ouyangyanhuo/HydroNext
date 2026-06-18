import { formatErrorMessage } from '@/utils/error';
import { Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function UserRegisterWithCodePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uname, setUname] = useState('');
  const [password, setPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== verifyPassword) {
      setError(t('Passwords do not match'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const formData = new URLSearchParams();
      formData.append('uname', uname);
      formData.append('password', password);
      formData.append('verifyPassword', verifyPassword);

      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: formData.toString(),
      });

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      const data = await res.json();
      if (data.error) {
        setError(formatErrorMessage(data.error, t('Registration failed')));
      } else {
        navigate('/');
      }
    } catch {
      setError(t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Title order={2} mb="md">{t('Register')}</Title>
        {error && <Text c="red" size="sm" mb="md">{error}</Text>}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label={t('Username')}
              value={uname}
              onChange={(e) => setUname(e.currentTarget.value)}
              required
              autoFocus
            />
            <PasswordInput
              label={t('Password')}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label={t('Confirm Password')}
              value={verifyPassword}
              onChange={(e) => setVerifyPassword(e.currentTarget.value)}
              required
            />
            <Button type="submit" fullWidth loading={loading}>
              {t('Register')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
