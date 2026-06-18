import { Anchor, Button, Checkbox, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function UserLoginPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uname, setUname] = useState('');
  const [password, setPassword] = useState('');
  const [rememberme, setRememberme] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const redirect = args.redirect || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ uname, password, rememberme, redirect }),
      });

      if (res.redirected) {
        navigate(res.url);
        return;
      }

      const data = await res.json();
      if (data.error) {
        setError(data.error.message || 'Login failed');
      } else {
        navigate(redirect);
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Title order={2} mb="md">{t('Login')}</Title>

        {error && (
          <Text c="red" size="sm" mb="md">{error}</Text>
        )}

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label={t('Username or Email')}
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
            <Checkbox
              label={t('Remember me')}
              checked={rememberme}
              onChange={(e) => setRememberme(e.currentTarget.checked)}
            />
            <Button type="submit" fullWidth loading={loading}>
              {t('Login')}
            </Button>
          </Stack>
        </form>

        <Group justify="space-between" mt="md">
          <Anchor component={Link} to="user_lostpass" size="sm">
            {t('Forgot Password?')}
          </Anchor>
          <Anchor component={Link} to="user_register" size="sm">
            {t('Register')}
          </Anchor>
        </Group>
      </Paper>
    </div>
  );
}
