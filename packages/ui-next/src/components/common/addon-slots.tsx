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
export const RecordActionExtras = defineSlot('component:record-action-extras', Empty);
export const RecordContentExtras = defineSlot('component:record-content-extras', Empty);
export const RecordRowActionExtras = defineSlot('component:record-row-action-extras', Empty);

export function useHasRecordRowActions() {
  return useSyncExternalStore(
    (notify) => store.subscribe('component:record-row-action-extras', notify),
    () => store.getInterceptors('component:record-row-action-extras').length > 0,
  );
}
