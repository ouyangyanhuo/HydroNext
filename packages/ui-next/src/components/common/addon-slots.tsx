/* eslint-disable react-refresh/only-export-components -- Addon setup and slot definitions are registration modules. */
import { useSyncExternalStore } from 'react';
import { defineSlot } from '@/registry';
import { store } from '@/registry/store';

const Empty = (_props: any) => null;

/** Optional UI contributions. Without addons these slots render nothing. */
export const AccountMenuExtras = defineSlot('component:account-menu-extras', Empty);
export const SettingsNavigationExtras = defineSlot('component:settings-navigation-extras', Empty);
export const ProfileTabExtras = defineSlot('component:profile-tab-extras', Empty);
export const ProfilePanelExtras = defineSlot('component:profile-panel-extras', Empty);
export const ProfileContentExtras = defineSlot('component:profile-content-extras', Empty);
export const ShellOverlays = defineSlot('component:shell-overlays', Empty);
export const ProblemPageExtras = defineSlot('component:problem-page-extras', Empty);
export const ContestManageActions = defineSlot('component:contest-manage-actions', Empty);
export const ScoreboardCellExtras = defineSlot('component:scoreboard-cell-extras', Empty);
export const ContestEditFields = defineSlot('component:contest-edit-fields', Empty);
export const ContestParticipantNotice = defineSlot('component:contest-participant-notice', Empty);
export const ContestParticipationWarning = defineSlot('component:contest-participation-warning', Empty);
export const ContestFinishAction = defineSlot('component:contest-finish-action', Empty);
export const ContestEndMessage = defineSlot('component:contest-end-message', ({ children }: any) => children);
export const RecordActionExtras = defineSlot('component:record-action-extras', Empty);
export const RecordContentExtras = defineSlot('component:record-content-extras', Empty);
export const RecordRowActionExtras = defineSlot('component:record-row-action-extras', Empty);

export function useHasRecordRowActions() {
  return useSyncExternalStore(
    (notify) => store.subscribe('component:record-row-action-extras', notify),
    () => store.getInterceptors('component:record-row-action-extras').length > 0,
  );
}
