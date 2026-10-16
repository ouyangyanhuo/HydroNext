import { Alert, Badge, Group, Stack, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useI18n } from '@/hooks/use-i18n';

interface ProctorStatus {
  attend?: number;
  proctorEnded?: boolean;
  proctorLogUploaded?: boolean;
  proctorTeam?: { total: number, uploaded: number, pending: { uid: number, name: string }[] };
}

export function ContestProctorNotice({ enabled, status }: { enabled?: boolean, status?: ProctorStatus }) {
  const { t } = useI18n();
  if (!enabled) return null;

  const team = status?.proctorTeam;
  const badgeColor = status?.proctorLogUploaded ? 'green' : status?.proctorEnded ? 'red' : 'orange';
  const badgeLabel = status?.proctorLogUploaded
    ? 'Final log uploaded'
    : status?.proctorEnded
      ? 'Results invalid: log pending'
      : 'Results provisional: final log required';

  return (
    <Alert
      color="indigo"
      icon={<IconShieldCheck size={20} />}
      title={t('Proctored contest')}
    >
      <Stack gap="xs">
        <Text size="sm">{t('Use an up-to-date proctor client to submit.')}</Text>
        {team && <Text size="sm">{t('All team members must proctor independently and upload their own final logs.')}</Text>}
        <Text size="sm">
          {t(
            'Finish proctoring in the client and upload the encrypted final log. '
            + 'Failed uploads may be retried within the configured window.',
          )}
        </Text>
        {team && (
          <Stack gap={4}>
            <Badge color={team.uploaded === team.total ? 'green' : 'orange'} variant="light" w="fit-content">
              {t('Team logs: {0}/{1}', team.uploaded, team.total)}
            </Badge>
            {team.pending.length > 0
              ? <Text size="sm" c="dimmed">{t('Logs still required from: {0}', team.pending.map((member) => member.name).join('、'))}</Text>
              : <Text size="sm" c="green">{t('All team logs uploaded')}</Text>}
          </Stack>
        )}
        {status?.attend && (
          <Group gap="xs" mt={2}>
            <Badge color={badgeColor} variant="light" size="sm">
              {team ? t(status.proctorLogUploaded ? 'My log uploaded' : 'My log pending') : t(badgeLabel)}
            </Badge>
          </Group>
        )}
      </Stack>
    </Alert>
  );
}
