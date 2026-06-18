import { Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect } from 'react';
import { useI18n } from '@/hooks/use-i18n';

export default function UserLogoutPage() {
  const { t } = useI18n();
  

  useEffect(() => {
    fetch('/logout', { method: 'GET', credentials: 'same-origin' })
      .then(() => { window.location.href = '/'; })
      .catch(() => { window.location.href = '/'; });
  }, []);

  return (
    <Center className="min-h-[50vh]">
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text c="dimmed">{t('Logging out...')}</Text>
      </Stack>
    </Center>
  );
}
