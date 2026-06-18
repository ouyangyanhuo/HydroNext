import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';

export default function UserRegisterMailSentPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Stack align="center" gap="md">
          <Title order={2}>{t('Verification Email Sent')}</Title>
          <Text ta="center">{t('A verification link has been sent to your email. Please check your inbox to complete registration.')}</Text>
          <Button component={Link} to="user_login" variant="light">{t('Back to Login')}</Button>
        </Stack>
      </Paper>
    </div>
  );
}
