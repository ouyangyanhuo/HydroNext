import { after, before, intercept, patch, replace, wrap } from './interceptors';
import { registerLayout } from './layout';
import { ownRegistration, registrationScope } from './lifecycle';
import { registerPage } from './page';

export interface PluginAPI {
  intercept: typeof intercept;
  before: typeof before;
  after: typeof after;
  patch: typeof patch;
  replace: typeof replace;
  wrap: typeof wrap;
  registerPage: typeof registerPage;
  registerLayout: typeof registerLayout;
}

export function createPluginAPI(): PluginAPI {
  return {
    intercept, before, after, patch, replace, wrap,
    registerPage, registerLayout,
  };
}

export interface PluginDefinition {
  name: string;
  setup: (api: PluginAPI) => (() => void) | void;
}

export function installPlugin(plugin: PluginDefinition): () => void {
  const scope = registrationScope();
  try {
    scope.run(() => {
      const cleanup = plugin.setup(createPluginAPI());
      if (typeof cleanup === 'function') ownRegistration(cleanup);
    });
  } catch (error) {
    scope.dispose();
    throw error;
  }
  return scope.dispose;
}
