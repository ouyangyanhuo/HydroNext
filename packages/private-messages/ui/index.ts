import type { PluginDefinition } from '@hydrooj/ui-next';
import { MessagesMenuEntry } from './menu-entry';

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  api.registerPage('home_messages', () => import('./home_messages'), { title: 'Messages' });
  return api.after('component:account-menu-extras', MessagesMenuEntry);
}
