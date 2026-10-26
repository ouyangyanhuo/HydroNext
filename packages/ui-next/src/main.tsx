import './styles/tailwind.css';
import './styles/markdown.css';
import './styles/button.css';
import './pages';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as api from './api';
import App from './app';
import { PageDataProvider } from './context/page-data';
import { RouterProvider } from './context/router';
import { initialPage, pluginsUrl } from './globals';
import { installPlugin } from './registry';
import { awaitPluginLoad, loadPluginEntries, type PluginEntry } from './registry/plugin-loader';
import { useNotificationStore } from './stores/notification';
import { usePluginHealth } from './stores/plugin-health';

declare global {
  interface Window {
    __hydroExports: typeof api;
    __hydroPlugins?: PluginEntry[];
    __hydroNotificationStore: typeof useNotificationStore;
  }
}

window.__hydroExports = api;
// Expose the notification store for optional UI plugins.
window.__hydroNotificationStore = useNotificationStore;

async function loadPlugins() {
  let plugins: PluginEntry[] = [];
  const failed = (name: string, error: unknown) => {
    console.error(`[Hydro] Failed to load plugin ${name}:`, error);
    usePluginHealth.getState().recordFailure(name);
  };
  try {
    if (import.meta.env.DEV) {
      const mod = await awaitPluginLoad(() => import('virtual:hydro-plugins'));
      plugins = mod.default;
    } else {
      await awaitPluginLoad(() => import(/* @vite-ignore */ pluginsUrl || '/plugins.js'));
      plugins = window.__hydroPlugins as PluginEntry[];
    }
    if (!Array.isArray(plugins)) throw new Error('Invalid plugin manifest.');
    await loadPluginEntries(plugins, installPlugin, failed);
  } catch (error) {
    failed('Plugin loader', error);
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
