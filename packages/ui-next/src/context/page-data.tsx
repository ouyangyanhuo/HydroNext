/* eslint-disable react-refresh/only-export-components */

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useRouteStore } from '@/stores/route';
import { type UiContext, type UserContext, useSessionStore } from '@/stores/session';

export interface PageData {
  name: string;
  args: {
    UserContext: Record<string, any>;
    UiContext: Record<string, any>;
    [key: string]: any;
  };
  url: string;
}

interface PageDataContextValue {
  data: PageData;
  setData: React.Dispatch<React.SetStateAction<PageData>>;
}

const PageDataContext = createContext<PageDataContextValue | null>(null);

interface PageDataProviderProps {
  initial: PageData;
  children: ReactNode;
}

export function PageDataProvider({ initial, children }: PageDataProviderProps) {
  const [data, setData] = useState<PageData>(initial);
  const value = useMemo(() => ({ data, setData }), [data]);

  // Sync page data to Zustand stores
  const setSession = useSessionStore((s) => s.setSession);
  const setRouteMap = useRouteStore((s) => s.setRouteMap);
  const setPage = useRouteStore((s) => s.setPage);

  useEffect(() => {
    if (data.args?.UserContext && data.args?.UiContext) {
      setSession({
        user: data.args.UserContext as unknown as UserContext,
        ui: data.args.UiContext as unknown as UiContext,
      });
    }
  }, [data.args?.UserContext, data.args?.UiContext, setSession]);

  useEffect(() => {
    // Extract route_map from the injection data (it's at the top level, not in args)
    const injection = (window as any).__hydroInjection;
    if (injection?.route_map) {
      setRouteMap(injection.route_map);
    }
  }, [setRouteMap]);

  useEffect(() => {
    setPage(data.name, data.url);
  }, [data.name, data.url, setPage]);

  // Update document title
  useEffect(() => {
    const serverName = data.args?.UiContext?.serverName || 'Hydro';
    const domainName = data.args?.UiContext?.domainId !== 'system' ? data.args?.UiContext?.domain?.name : '';
    const pageName = data.name;

    if (pageName === 'homepage' || !pageName) {
      document.title = serverName;
    } else {
      document.title = domainName
        ? `${serverName} - ${pageName} - ${domainName}`
        : `${serverName} - ${pageName}`;
    }
  }, [data.name, data.args?.UiContext]);

  return <PageDataContext.Provider value={value}>{children}</PageDataContext.Provider>;
}

function usePageDataContext(): PageDataContextValue {
  const ctx = useContext(PageDataContext);
  if (!ctx) throw new Error('usePageData must be used within PageDataProvider');
  return ctx;
}

export function usePageData(): PageData {
  return usePageDataContext().data;
}

export function useSetPageData(): React.Dispatch<React.SetStateAction<PageData>> {
  return usePageDataContext().setData;
}

export function useUiContext(): PageData['args']['UiContext'] {
  return usePageDataContext().data.args.UiContext;
}

export function useUserContext(): PageData['args']['UserContext'] {
  return usePageDataContext().data.args.UserContext;
}
