import { Alert, Group, Text } from '@mantine/core';
import { Button } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';
import { usePluginHealth } from '@/stores/plugin-health';

export function PluginHealthNotice() {
  const { t } = useI18n();
  const failed = usePluginHealth((state) => state.failed);
  if (!failed.length) return null;
  return <Alert color="yellow" title={t('Some plugins are unavailable')} role="alert" className="hydro-container mt-4">
    <Group justify="space-between" gap="sm">
      <Text size="sm">{t('Some features could not be loaded. Reload the page or contact the administrator.')}
        {' '}{failed.join(', ')}
      </Text>
      <Button size="xs" variant="light" onClick={() => window.location.reload()}>{t('Reload page')}</Button>
    </Group>
  </Alert>;
}
