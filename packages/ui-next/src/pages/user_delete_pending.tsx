import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';

export default function UserDeletePendingPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Stack align="center" gap="md">
          <Title order={2}>{t('Account Deletion Pending')}</Title>
          <Text ta="center">{t('Your account deletion request has been received. It will be processed within 30 days. You can cancel the deletion by logging in again.')}</Text>
          <Group>
            <Button component={Link} to="user_login" variant="light">{t('Login')}</Button>
            <Button component={Link} to="homepage">{t('Home')}</Button>
          </Group>
        </Stack>
      </Paper>
    </div>
  );
}
