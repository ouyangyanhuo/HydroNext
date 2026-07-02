/* eslint-disable react-refresh/only-export-components */

import { match } from 'path-to-regexp';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { endpoints, isInjected, routeMapStore } from '../globals';
import { useSetPageData } from './page-data';

interface InternalState {
  status: 'idle' | 'loading' | 'error';
  error: Error | null;
}

type RouterAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS' }
  | { type: 'FETCH_ERROR', error: Error };

function routerReducer(state: InternalState, action: RouterAction): InternalState {
  switch (action.type) {
    case 'FETCH_START': return { status: 'loading', error: null };
    case 'FETCH_SUCCESS': return { status: 'idle', error: null };
    case 'FETCH_ERROR': return { status: 'error', error: action.error };
    default: return state;
  }
}

export interface RouterState {
  loading: boolean;
  error: Error | null;
}

interface RouterNavigateContextValue {
  navigate: (url: string) => Promise<void>;
}

function getRoutePath(url: string): string {
  const pathname = new URL(url, endpoints[0]).pathname;
  if (!pathname.startsWith('/d/')) return pathname;
  return `/${pathname.split('/').slice(3).join('/')}`;
}

function resolvePageName(url: string, headerName: string, routeMap: Record<string, string>): string {
  if (headerName) return headerName;

  const pathname = getRoutePath(url);
  for (const [name, pattern] of Object.entries(routeMap)) {
    try {
      if (match(pattern)(pathname)) return name;
    } catch {
      // Ignore invalid patterns from third-party routes.
    }
  }
  return '';
}

const RouterStateContext = createContext<RouterState | null>(null);
const RouterNavigateContext = createContext<RouterNavigateContextValue | null>(null);

export const RouterProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(routerReducer, { status: 'idle', error: null });
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const setData = useSetPageData();

  const canNavigateInDocument = useCallback((url: string) => {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  }, []);

  const fetchPage = useCallback(
    async (url: string, init = false, push = false) => {
      abortRef.current?.abort();
      const gen = ++genRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      const isCurrent = () => gen === genRef.current && !controller.signal.aborted;

      dispatch({ type: 'FETCH_START' });

      let lastError: Error | null = null;
      for (const ep of endpoints) {
        try {
          const signal = endpoints.length > 1
            ? AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
            : controller.signal;
          const reqUrl = new URL(url, ep).href;
          const res = await fetch(reqUrl, {
            signal,
            headers: {
              Accept: 'application/json',
              'x-hydro-inject': [
                'uicontext', 'usercontext', 'pagename',
                ...(init ? ['routemap'] : []),
              ].join(','),
            },
          });
          if (!isCurrent()) return false;

          if (res.redirected) {
            window.location.href = res.url;
            return false;
          }
          if (!res.ok) {
            let errorMessage = `Navigation failed: ${res.status} ${res.statusText}`;
            try {
              const errorBody = await res.json();
              if (errorBody.error) {
                errorMessage = typeof errorBody.error === 'string'
                  ? errorBody.error
                  : errorBody.error.message || errorMessage;
              }
            } catch {
              // ignore JSON parse errors
            }
            if (!isCurrent()) return false;

            if (res.status === 401 || res.status === 403) {
              window.location.href = '/';
              return false;
            }
            throw new Error(errorMessage);
          }
          const body = await res.json();
          if (!isCurrent()) return false;

          if (body.url && typeof body.url === 'string') {
            window.location.href = body.url;
            return false;
          }
          const headerPageName = res.headers.get('x-hydro-page') || '';
          const nextRouteMap = init && body.routeMap && typeof body.routeMap === 'object'
            ? { ...routeMapStore.getSnapshot(), ...body.routeMap }
            : routeMapStore.getSnapshot();
          const pageName = resolvePageName(reqUrl, headerPageName, nextRouteMap);
          // console.log('[Hydro] data from', reqUrl, 'received:', body, 'pageName:', pageName);

          if (init && body.routeMap && typeof body.routeMap === 'object') {
            routeMapStore.set(body.routeMap);
          }
          const nextUrl = new URL(url, window.location.href);
          if (push && nextUrl.href !== window.location.href) {
            const historyUrl = nextUrl.pathname + nextUrl.search + nextUrl.hash;
            history.pushState({ url: nextUrl.pathname + nextUrl.search }, '', historyUrl);
          }
          setData((prev) => ({
            ...prev,
            args: body,
            name: pageName,
            url: nextUrl.pathname + nextUrl.search,
          }));
          dispatch({ type: 'FETCH_SUCCESS' });
          return true;
        } catch (e) {
          if (!isCurrent()) return false;

          lastError = e instanceof Error ? e : new Error(String(e));
          console.warn('[Hydro] endpoint', ep, 'failed:', lastError.message);
          if (controller.signal.aborted) {
            return false;
          }
        }
      }

      console.error('[Hydro] all endpoints failed:', lastError);
      if (!isCurrent()) return false;
      dispatch({ type: 'FETCH_ERROR', error: lastError! });
      window.location.href = url;
      return false;
    },
    [setData],
  );

  useEffect(() => {
    const getCurrentUrl = () => window.location.pathname + window.location.search;
    const handlePopState = () => {
      // The address bar is authoritative. Other features may replace a history
      // entry without preserving our custom state.
      void fetchPage(getCurrentUrl());
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      // A document restored from the back-forward cache may hold page data for
      // a different in-document history entry.
      if (event.persisted) void fetchPage(getCurrentUrl());
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [fetchPage]);

  useEffect(() => () => {
    ++genRef.current;
    abortRef.current?.abort();
  }, []);

  // If no server-side injection, fetch initial page data from the API
  useEffect(() => {
    if (!isInjected) {
      console.log('[Hydro] no initial data injection found, fetching page data for current URL');
      fetchPage(window.location.pathname + window.location.search, true);
    }
  }, [fetchPage]);

  const stateValue = useMemo(
    () => ({ loading: state.status === 'loading', error: state.error }),
    [state.status, state.error],
  );

  const navigate = useCallback(async (url: string) => {
    if (!canNavigateInDocument(url)) {
      window.location.href = url;
      return;
    }
    await fetchPage(url, false, true);
  }, [canNavigateInDocument, fetchPage]);

  const navigateValue = useMemo<RouterNavigateContextValue>(() => ({ navigate }), [navigate]);

  return (
    <RouterNavigateContext.Provider value={navigateValue}>
      <RouterStateContext.Provider value={stateValue}>
        {children}
      </RouterStateContext.Provider>
    </RouterNavigateContext.Provider>
  );
};

export function useRouterState(): RouterState {
  const ctx = useContext(RouterStateContext);
  if (!ctx) throw new Error('useRouterState must be used within RouterProvider');
  return ctx;
}

export function useNavigate(): (url: string) => Promise<void> {
  const ctx = useContext(RouterNavigateContext);
  if (!ctx) throw new Error('useNavigate must be used within RouterProvider');
  return ctx.navigate;
}
