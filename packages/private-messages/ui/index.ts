import type { PluginDefinition } from '@hydrooj/ui-next';

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  api.registerPage('home_messages', () => import('./home_messages'), { title: 'Messages' });
}
