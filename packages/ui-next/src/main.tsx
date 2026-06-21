import './styles/tailwind.css';
import './styles/markdown.css';
import './pages';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as api from './api';
import App from './app';
import { PageDataProvider } from './context/page-data';
import { RouterProvider } from './context/router';
import { initialPage, pluginsUrl } from './globals';
import { pasteGuardPlugin } from './plugins/paste-guard';
import { installPlugin } from './registry';
import { useNotificationStore } from './stores/notification';

declare global {
  interface Window {
    __hydroExports: typeof api;
    __hydroPlugins?: api.PluginDefinition[];
    __hydroNotificationStore: typeof useNotificationStore;
  }
}

window.__hydroExports = api;
// Expose notification store for plugins (e.g. paste-guard)
window.__hydroNotificationStore = useNotificationStore;

// Install built-in plugins
try {
  installPlugin(pasteGuardPlugin);
} catch (e) {
  console.error(`[Hydro] Failed to install plugin ${pasteGuardPlugin.name}:`, e);
}

async function loadPlugins() {
  let plugins: api.PluginDefinition[] = [];
  if (import.meta.env.DEV) {
    const mod = await import('virtual:hydro-plugins');
    plugins = mod.default || [];
  } else {
    try {
      await import(/* @vite-ignore */ pluginsUrl || '/plugins.js');
      plugins = window.__hydroPlugins || [];
    } catch (e) {
      console.warn('[Hydro] Failed to load plugins:', e);
    }
  }

  for (const plugin of plugins) {
    console.log(`[Hydro] Installing plugin: ${plugin.name}`);
    try {
      installPlugin(plugin);
    } catch (e) {
      console.error(`[Hydro] Failed to install plugin ${plugin.name}:`, e);
    }
  }
}

// eslint-disable-next-line antfu/no-top-level-await
await loadPlugins();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PageDataProvider initial={initialPage}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </PageDataProvider>
  </StrictMode>,
);
