import type { PluginDefinition } from '@hydrooj/ui-next';
import { setup as setupPolicy } from './policy';
import { PasteLimitSetting } from './settings';

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  const disposePolicy = setupPolicy(api);
  const disposeSettings = api.wrap('component:setting-input', PasteLimitSetting);
  return () => {
    disposeSettings();
    disposePolicy?.();
  };
}
