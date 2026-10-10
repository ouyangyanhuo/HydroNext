import { Alert, Badge, Group, Stack, Text } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';

export function ContestProctorNotice({ enabled, status }: { enabled?: boolean, status?: any }) {
  const { t } = useI18n();
  if (!enabled) return null;
  return <Alert title={t('Proctored contest')}>
    <Stack gap="xs">
      <Text size="sm">{t('Use an up-to-date proctor client to submit.')}</Text>
      <Text size="sm">{t('Finish proctoring in the client and upload the encrypted final log. Failed uploads may be retried within the configured window.')}</Text>
      {status?.attend && <Group gap="xs">
        <Badge color={status.proctorLogUploaded ? 'green' : status.proctorEnded ? 'red' : 'orange'}>
          {t(status.proctorLogUploaded ? 'Final log uploaded' : status.proctorEnded ? 'Results invalid: log pending' : 'Results provisional: final log required')}
        </Badge>
      </Group>}
    </Stack>
  </Alert>;
}
