import { useI18n } from '@hydrooj/ui-next';
import { Badge, Card, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';

interface ProctorTeamMember {
  uid: number;
  name: string;
}

interface ProctorTeam {
  total: number;
  uploaded: number;
  pending: ProctorTeamMember[];
}

interface ProctorStatus {
  attend?: number;
  proctorEnded?: boolean;
  proctorLogUploaded?: boolean;
  proctorTeam?: ProctorTeam;
}

export function ContestProctorNotice({
  enabled,
  status,
}: {
  enabled?: boolean;
  status?: ProctorStatus;
}) {
  const { t } = useI18n();
  if (!enabled) return null;

  const team = status?.proctorTeam;
  const badgeColor = status?.proctorLogUploaded ? 'green' : status?.proctorEnded ? 'red' : 'orange';
  const badgeLabel = status?.proctorLogUploaded
    ? 'Final log uploaded'
    : status?.proctorEnded
      ? 'Results invalid: log pending'
      : 'Results provisional: final log required';

  const dotColor = status?.proctorLogUploaded ? 'var(--hydro-success)' : status?.proctorEnded ? 'var(--hydro-danger)' : 'var(--hydro-warning)';

  return (
    <Card
      withBorder
      p="md"
      className="hydro-proctor-notice"
    >
      <div className="hydro-proctor-notice__layout">
        <div className="hydro-proctor-notice__body">
          <div className="hydro-proctor-notice__title">
            <div className="hydro-proctor-notice__icon">
              <IconShieldCheck size={16} stroke={2.2} />
            </div>
            <Text fw={700} size="sm">
              {t('Proctored contest')}
            </Text>
          </div>
          <div className="hydro-proctor-notice__details">
            <p>
              <span>•</span>
              <span>{t('Use an up-to-date proctor client to submit.')}</span>
            </p>
            <p>
              <span>•</span>
              <span>
                {t(
                  'Finish proctoring in the client and upload the encrypted final log. '
                  + 'Failed uploads may be retried within the configured window.',
                )}
              </span>
            </p>
            {team && (
              <p>
                <span>•</span>
                <span>{t('All team members must proctor independently and upload their own final logs.')}</span>
              </p>
            )}
            {team && team.pending.length > 0 && (
              <p>
                {t('Logs still required from: {0}', team.pending.map((member) => member.name).join('、'))}
              </p>
            )}
          </div>
        </div>

        <div
          className="hydro-proctor-notice__status"
        >
          {status?.attend ? (
            <>
              <Badge
                color={badgeColor}
                variant="light"
                size="lg"
                leftSection={<span className="hydro-proctor-dot" style={{ '--dot-color': dotColor } as React.CSSProperties} />}

              >
                {team ? t(status.proctorLogUploaded ? 'My log uploaded' : 'My log pending') : t(badgeLabel)}
              </Badge>
              {team && (
                <Badge color={team.uploaded === team.total ? 'green' : 'orange'} variant="outline" size="sm">
                  {t('Team logs: {0}/{1}', team.uploaded, team.total)}
                </Badge>
              )}
            </>
          ) : (
            <Badge color="indigo" variant="light" size="lg">
              {t('Proctored contest')}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
