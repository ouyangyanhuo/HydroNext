/* eslint-disable react-refresh/only-export-components -- Addon setup and slot components. */
import './proctor.css';

import {
  type PluginDefinition, registerManageEntry, registerRequestSecurity, useI18n,
} from '@hydrooj/ui-next';
import { Checkbox, Text } from '@mantine/core';
import { ContestProctorNotice } from './components/contest-proctor-notice';
import { ProctorFinishButton } from './components/proctor-finish-button';
import { proctorAccessHeaders, proctorAccessRequest, proctorSubmissionHeaders } from './utils/proctor';

function EditFields({ form, setForm, data }: any) {
  const { t } = useI18n();
  return <Checkbox
    label={t('Enable contest proctoring')}
    description={t(data.proctorPolicyLocked ? 'Proctor policy cannot change after the contest starts.'
      : 'Requires a compatible proctor client. Final logs are required for valid results.')}
    disabled={!!data.proctorPolicyLocked || !data.contestSecurityAvailable}
    checked={!!form.proctorEnabled}
    onChange={(event) => {
      const enabled = event.currentTarget.checked;
      setForm((previous: any) => ({ ...previous, proctorEnabled: enabled }));
    }}
  />;
}
function Notice({ data, status }: any) {
  return <ContestProctorNotice enabled={!!data.tdoc?.proctorEnabled} status={status} />;
}
function ParticipationWarning({ data, team }: any) {
  const { t } = useI18n();
  return data.tdoc?.proctorEnabled && team
    ? <Text size="sm" c="dimmed">{t('All team members must proctor independently and upload their own final logs.')}</Text> : null;
}
function EndMessage({ data, status, children }: any) {
  const { t } = useI18n();
  return data.tdoc?.proctorEnabled ? t(status.members
    ? 'This ends the contest for every teammate. Each member must still end personal proctoring and upload their own log in the client.'
    : 'This ends your contest. You must still end proctoring and upload your log in the client.') : children;
}

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  api.registerPage('manage_proctor', () => import('./pages/manage_proctor'), { title: 'Proctor settings' });
  api.registerPage('manage_proctor_logs', () => import('./pages/manage_proctor_logs'), { title: 'Proctor logs' });
  const dispose = [
    registerManageEntry({ to: 'manage_proctor', title: 'Proctor settings',
      desc: 'Manage authentication keys, session policy and encrypted logs.', group: 'Configuration', order: 40 }),
    registerRequestSecurity({
      accessHeaders: proctorAccessHeaders,
      submissionHeaders: (url, payload) => proctorSubmissionHeaders(true, url, payload),
      canRetry: (url) => typeof (window as any).examAPI?.proctorHeaders === 'function'
        && !!proctorAccessRequest(url, window.location.origin),
    }),
    api.after('component:contest-edit-fields', EditFields),
    api.after('component:contest-participant-notice', Notice),
    api.after('component:contest-participation-warning', ParticipationWarning),
    api.replace('component:contest-end-message', EndMessage),
    api.after('component:contest-finish-action', ProctorFinishButton),
  ];
  return () => dispose.reverse().forEach((remove) => remove());
}
