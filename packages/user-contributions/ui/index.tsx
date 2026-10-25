/* eslint-disable react-refresh/only-export-components -- An addon registers its profile contribution. */
import type { PluginDefinition } from '@hydrooj/ui-next';
import { ContributionCard } from './contribution-card';

export function ProfileContributions({ user, data }: any) {
  return data.contributions ? <ContributionCard key={user._id} history={data.contributions} /> : null;
}

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  return api.after('component:profile-content-extras', ProfileContributions);
}
