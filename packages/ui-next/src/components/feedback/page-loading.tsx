import { Center, Loader, Stack, Text } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';

export function PageLoading() {
  const { t } = useI18n();
  return (
    <Center
      className="min-h-[50vh]"
      style={{ animation: 'hydro-fade-in var(--hydro-duration-slow) var(--hydro-ease-out) both' }}
    >
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text c="dimmed" size="sm">
          {t('Loading...')}
        </Text>
      </Stack>
    </Center>
  );
}
