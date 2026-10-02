import { Text } from '@mantine/core';
import { AuthPanel } from '@/components/auth/auth-panel';
import { Button } from '@/components/common/button';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';

export default function UserLostpassPage() {
  const { t } = useI18n();

  return (
    <AuthPanel title={t('Forgot Password')} eyebrow={t('Account')}>
      <Text role="status" ta="center">{t('Please contact the administrator')}</Text>
      <Button component={Link} to="user_login" variant="light" fullWidth>
        {t('Back to Login')}
      </Button>
    </AuthPanel>
  );
}
