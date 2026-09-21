import { Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect } from 'react';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';

export default function UserLogoutPage() {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();

  useEffect(() => {
    // POST to the current domain's logout endpoint (GET only shows template).
    fetch(buildUrl('user_logout'), { method: 'POST', credentials: 'same-origin' })
      .then(() => { window.location.href = buildUrl('homepage'); })
      .catch(() => { window.location.href = buildUrl('homepage'); });
  }, [buildUrl]);

  return (
    <Center className="min-h-[50vh]">
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text c="dimmed">{t('Logging out...')}</Text>
      </Stack>
    </Center>
  );
}
