import { Anchor, Button, Checkbox, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Link } from '@/components/link';
import { AuthPanel } from '@/components/auth/auth-panel';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
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
      const formData = new URLSearchParams();
      formData.append('uname', uname);
      formData.append('password', password);
      formData.append('rememberme', rememberme ? 'on' : '');
      formData.append('redirect', redirect);

      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: formData.toString(),
      });

      if (res.redirected) {
        navigate(res.url);
        return;
      }

      const data = await res.json();
      if (data.error) {
        let msg = data.error.message || t('Login failed');
        if (data.error.params) {
          data.error.params.forEach((p: string, i: number) => {
            msg = msg.replace(`{${i}}`, p);
          });
        }
        setError(msg);
      } else {
        navigate(redirect);
      }
    } catch (err) {
      setError(t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPanel title={t('Login')} eyebrow={t('Account')} description={t('Sign in to continue to Hydro.')}>
      {error && (
        <Text c="red" size="sm">{error}</Text>
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

      <Group justify="space-between">
        <Anchor component={Link} to="user_lostpass" size="sm">
          {t('Forgot Password?')}
        </Anchor>
        <Anchor component={Link} to="user_register" size="sm">
          {t('Register')}
        </Anchor>
      </Group>

      {(args.loginMethods || []).length > 0 && (
        <OAuthButtons methods={args.loginMethods} redirect={redirect} />
      )}
    </AuthPanel>
  );
}
