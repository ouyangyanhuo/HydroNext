/* eslint-disable react-refresh/only-export-components -- Addon setup and slot components. */
import { type PluginDefinition, useI18n } from '@hydrooj/ui-next';
import { Checkbox } from '@mantine/core';

function EditFields({ form, setForm, data }: any) {
  const { t } = useI18n();
  if (form.rule === 'homework') return null;
  return <Checkbox
    label={t('Objective problems may only be submitted once')}
    description={t(data.objectiveOnceLocked ? 'The objective submission policy cannot change after the contest starts.'
      : 'Each participant or team may submit each objective answer sheet once. Unanswered questions are allowed after confirmation.')}
    checked={!!(form.objectiveOnce ?? data.tdoc?.objectiveOnce)}
    disabled={!!data.objectiveOnceLocked}
    onChange={(event) => {
      const checked = event.currentTarget.checked;
      setForm((previous: any) => ({ ...previous, objectiveOnce: checked }));
    }}
  />;
}

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  return api.after('component:contest-edit-fields', EditFields);
}
