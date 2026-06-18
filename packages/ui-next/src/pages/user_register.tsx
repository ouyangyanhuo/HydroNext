import { Anchor, Button, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link } from '@/components/link';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function UserRegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mail, setMail] = useState('');
  const [uname, setUname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t('Passwords do not match'));
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mail, uname, password }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error.message || 'Registration failed');
      } else {
        navigate('/');
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
        <Title order={2} mb="md">{t('Register')}</Title>

        {error && (
          <Text c="red" size="sm" mb="md">{error}</Text>
        )}

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label={t('Email')}
              type="email"
              value={mail}
              onChange={(e) => setMail(e.currentTarget.value)}
              required
            />
            <TextInput
              label={t('Username')}
              value={uname}
              onChange={(e) => setUname(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label={t('Password')}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label={t('Confirm Password')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              required
            />
            <Button type="submit" fullWidth loading={loading}>
              {t('Register')}
            </Button>
          </Stack>
        </form>

        <Group justify="center" mt="md">
          <Anchor component={Link} to="user_login" size="sm">
            {t('Already have an account? Login')}
          </Anchor>
        </Group>
      </Paper>
    </div>
  );
}
