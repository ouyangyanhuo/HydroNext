import { type PluginDefinition, registerManageEntry } from '@hydrooj/ui-next';

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  api.registerPage('manage_client_updates', () => import('./pages/manage_client_updates'), { title: 'Update settings' });
  return registerManageEntry({
    to: 'manage_client_updates', title: 'Update settings',
    desc: 'Publish client versions, packages and update manifests.', group: 'Configuration', order: 45,
  });
}
