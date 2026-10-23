import { Badge, Card, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useI18n } from '@/hooks/use-i18n';
import { ProctorFinishButton } from './proctor-finish-button';

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

  const dotColorClass = status?.proctorLogUploaded
    ? 'bg-emerald-500'
    : status?.proctorEnded
      ? 'bg-rose-500'
      : 'bg-amber-500';

  return (
    <Card
      withBorder
      p="md"
      className={[
        'overflow-hidden border-[var(--hydro-border)] border-l-4 border-l-indigo-500',
        'bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]',
      ].join(' ')}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <IconShieldCheck size={16} stroke={2.2} />
            </div>
            <Text fw={700} size="sm" className="text-[var(--hydro-text)] leading-none">
              {t('Proctored contest')}
            </Text>
          </div>
          <div className="space-y-1.5 text-xs text-[var(--hydro-text-muted)] leading-relaxed">
            <p className="flex items-start gap-1.5 m-0">
              <span className="text-[var(--hydro-text-muted)] opacity-60 select-none">•</span>
              <span>{t('Use an up-to-date proctor client to submit.')}</span>
            </p>
            <p className="flex items-start gap-1.5 m-0">
              <span className="text-[var(--hydro-text-muted)] opacity-60 select-none">•</span>
              <span>
                {t(
                  'Finish proctoring in the client and upload the encrypted final log. '
                  + 'Failed uploads may be retried within the configured window.',
                )}
              </span>
            </p>
            {team && (
              <p className="flex items-start gap-1.5 m-0">
                <span className="text-[var(--hydro-text-muted)] opacity-60 select-none">•</span>
                <span>{t('All team members must proctor independently and upload their own final logs.')}</span>
              </p>
            )}
            {team && team.pending.length > 0 && (
              <p className="text-[11px] text-[var(--hydro-text-muted)] mt-1 pl-3 m-0">
                {t('Logs still required from: {0}', team.pending.map((member) => member.name).join('、'))}
              </p>
            )}
          </div>
        </div>

        <div
          className={[
            'shrink-0 flex flex-col items-start sm:items-end justify-center gap-2',
            'pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--hydro-border)]',
          ].join(' ')}
        >
          {status?.attend ? (
            <>
              <Badge
                color={badgeColor}
                variant="light"
                size="lg"
                leftSection={<span className={`w-2 h-2 rounded-full ${dotColorClass}`} />}
                className="font-semibold"
              >
                {team ? t(status.proctorLogUploaded ? 'My log uploaded' : 'My log pending') : t(badgeLabel)}
              </Badge>
              {team && (
                <Badge color={team.uploaded === team.total ? 'green' : 'orange'} variant="outline" size="sm">
                  {t('Team logs: {0}/{1}', team.uploaded, team.total)}
                </Badge>
              )}
              {!status.proctorLogUploaded && <ProctorFinishButton />}
            </>
          ) : (
            <Badge color="indigo" variant="light" size="lg" className="font-semibold">
              {t('Proctored contest')}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
