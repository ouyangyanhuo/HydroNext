import { Anchor, Button, Checkbox, Group, PasswordInput, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
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

  const redirect = args.redirect || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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
        notifications.show({ title: msg, message: '', color: 'red' });
      } else {
        navigate(redirect);
      }
    } catch (err) {
      notifications.show({ title: t('Network error'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPanel title={t('Login')} eyebrow={t('Account')} description={t('Sign in to continue to Hydro.')}>
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
