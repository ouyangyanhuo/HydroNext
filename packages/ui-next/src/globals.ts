import isRelativeUrl from 'is-relative-url';
import type { PageData } from './context/page-data';

const injectionEl = document.getElementById('__HYDRO_INJECTION__');
let injectionData: Record<string, any> = {};
if (injectionEl) {
  try {
    injectionData = JSON.parse(injectionEl.textContent!);
  } catch (e) {
    console.error('[Hydro] Failed to parse injection data:', e);
  }
}

// Expose injection data for other modules (e.g. page-data context for route_map)
(window as any).__hydroInjection = injectionData;

export const isInjected: boolean = !!injectionData.HYDRO_INJECTED;
export const hydroDomains: string[] = injectionData.hydro_domains ?? [];
export const pluginsUrl: string | undefined = injectionData.plugins_url;

interface RouteMapStore {
  _routeMap: Record<string, string>;
  _listeners: Set<() => void>;
  getSnapshot: () => Record<string, string>;
  subscribe: (listener: () => void) => () => void;
  set: (map: Record<string, string>) => void;
}

function createRouteMapStore(initial: Record<string, string>): RouteMapStore {
  const store: RouteMapStore = {
    _routeMap: initial,
    _listeners: new Set(),
    getSnapshot: () => store._routeMap,
    subscribe: (listener: () => void) => {
      store._listeners.add(listener);
      return () => { store._listeners.delete(listener); };
    },
    set: (map: Record<string, string>) => {
      store._routeMap = { ...store._routeMap, ...map };
      store._listeners.forEach((l) => l());
    },
  };
  return store;
}

export const routeMapStore: RouteMapStore = import.meta.hot?.data?.routeMapStore
  ?? createRouteMapStore(injectionData.route_map || {});
if (import.meta.hot) import.meta.hot.data.routeMapStore = routeMapStore;

function getRoutePath(url: string): string {
  const pathname = new URL(url, window.location.href).pathname;
  if (!pathname.startsWith('/d/')) return pathname;
  const domainRelativePath = pathname.split('/').slice(3).join('/');
  return domainRelativePath ? `/${domainRelativePath}` : '/';
}

function inferRouteName(url: string, routeMap: Record<string, string>): string {
  const routePath = getRoutePath(url);
  for (const [name, pattern] of Object.entries(routeMap)) {
    if (pattern === routePath) return name;
  }
  return routePath === '/' && routeMap.homepage === '/' ? 'homepage' : '';
}

export const endpoints: string[] = (() => {
  if (hydroDomains.length) {
    return hydroDomains
      .map((d) => d.includes('://') ? d : `${window.location.protocol}//${d}`)
      .map((d) => d.replace(/\/$/, ''));
  }
  if (typeof injectionData.endpoint === 'string') {
    const ep = injectionData.endpoint;
    if (isRelativeUrl(ep, { allowProtocolRelative: false })) {
      return [new URL(ep, window.location.href).href.replace(/\/$/, '')];
    }
    return [ep.replace(/\/$/, '')];
  }
  return [window.location.origin];
})();
export const endpointOrigins = new Set(endpoints.map((ep) => new URL(ep).origin));

export const initialPage: PageData = {
  name: (injectionData.name as string) || inferRouteName(window.location.href, injectionData.route_map || {}),
  args: (injectionData.args as any) || {},
  url: (injectionData.url as string) || (window.location.pathname + window.location.search),
};

// Locale data injected by the backend renderer
export const localeData: Record<string, string> = injectionData.locale || {};
export const initialLang: string = injectionData.lang || 'zh';
