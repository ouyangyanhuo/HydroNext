/* eslint-disable react-refresh/only-export-components */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, PERM } from '@/hooks/use-permission';
import { getPageMetadata } from '@/registry/page-metadata';
import { useDomainNavigationPreview } from '@/stores/domain-navigation-preview';
import { useRouteStore } from '@/stores/route';
import { type UiContext, type UserContext, useSessionStore } from '@/stores/session';
import {
  type PageTransitionDirection, resolvePageTransitionDirection, type TopNavVisibilityOptions,
} from '@/utils/top-nav';

interface PageViewTransition {
  finished: Promise<void>;
  skipTransition?: () => void;
}

type PageViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => PageViewTransition;
};

export interface PageTransitionState {
  direction: PageTransitionDirection;
  viaViewTransition: boolean;
}

export interface PageData {
  name: string;
  template: string;
  args: {
    UserContext: Record<string, any>;
    UiContext: Record<string, any>;
    [key: string]: any;
  };
  url: string;
}

interface PageDataContextValue {
  data: PageData;
  revision: number;
  transition: PageTransitionState;
  setData: (next: React.SetStateAction<PageData>, preservePage?: boolean) => void;
}

const PageDataContext = createContext<PageDataContextValue | null>(null);

interface PageDataProviderProps {
  initial: PageData;
  children: ReactNode;
}

function getVisibilityOptions(nextData: PageData): TopNavVisibilityOptions {
  const session = useSessionStore.getState();
  const ui = (nextData.args?.UiContext || session?.ui || {}) as Record<string, any>;
  const user = (nextData.args?.UserContext || session?.user || {}) as Record<string, any>;
  const domainId = ui.domainId;
  const previewState = useDomainNavigationPreview.getState?.()?.preview;
  const preview = previewState && previewState.domainId === domainId ? previewState : null;
  const navigationHidden = preview ? preview.navigationHidden : ui.domain?.navigationHidden;
  const contestMode = preview ? preview.contestMode : ui.domain?.contestMode === true;
  const focus = preview ? preview.contestFocus : ui.domain?.contestFocus;
  const focusContest = contestMode && typeof focus === 'string' && /^[a-f\d]{24}$/i.test(focus) ? focus : '';
  const hasPermField = user?.perm !== undefined && user?.perm !== null;

  return {
    navigationHidden,
    contestMode,
    focusContest,
    canViewRanking: hasPermField ? hasPermValue(user.perm, PERM.PERM_VIEW_RANKING) : undefined,
    canViewContestRanking: hasPermField ? hasPermValue(user.perm, PERM.PERM_VIEW_CONTEST_SCOREBOARD) : undefined,
  };
}

export function PageDataProvider({ initial, children }: PageDataProviderProps) {
  const [{ data, revision, transition }, setState] = useState<{
    data: PageData;
    revision: number;
    transition: PageTransitionState;
  }>({
    data: initial,
    revision: 0,
    transition: { direction: 'fade', viaViewTransition: false },
  });
  const dataRef = useRef(initial);
  const activeTransitionRef = useRef<PageViewTransition | null>(null);
  const transitionGenRef = useRef(0);

  useEffect(() => () => {
    ++transitionGenRef.current;
    activeTransitionRef.current?.skipTransition?.();
    activeTransitionRef.current = null;
    if (typeof document !== 'undefined') {
      delete document.documentElement.dataset.pageTransition;
    }
  }, []);

  const setData = useCallback<PageDataContextValue['setData']>((next, preservePage = false) => {
    const previousData = dataRef.current;
    const nextData = typeof next === 'function' ? next(dataRef.current) : next;
    dataRef.current = nextData;

    const shouldRemount = !(preservePage && nextData.name === previousData.name
      && (nextData.url === previousData.url || nextData.args === previousData.args) && !nextData.args.error);
    const direction = shouldRemount
      ? resolvePageTransitionDirection(previousData.name, nextData.name, getVisibilityOptions(nextData))
      : 'fade';

    const commitUpdate = (viaViewTransition: boolean) => {
      if (nextData.args?.UserContext && nextData.args?.UiContext) {
        useSessionStore.getState().setSession({
          user: nextData.args.UserContext as unknown as UserContext,
          ui: nextData.args.UiContext as unknown as UiContext,
        });
      }
      useRouteStore.getState().setPage(nextData.name, nextData.url);

      setState((prev) => ({
        data: nextData,
        // URL-only mode changes and background permission updates must not destroy an open editor's local state.
        revision: shouldRemount ? prev.revision + 1 : prev.revision,
        transition: shouldRemount ? { direction, viaViewTransition } : prev.transition,
      }));
    };

    const transitionDocument = typeof document !== 'undefined' ? (document as PageViewTransitionDocument) : null;
    const startViewTransition = transitionDocument?.startViewTransition?.bind(transitionDocument);
    const reducedMotion = typeof window !== 'undefined'
      && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    const gen = ++transitionGenRef.current;
    activeTransitionRef.current?.skipTransition?.();
    activeTransitionRef.current = null;
    const clearTransition = () => {
      if (transitionGenRef.current !== gen) return;
      if (transitionDocument) delete transitionDocument.documentElement.dataset.pageTransition;
      activeTransitionRef.current = null;
    };

    // Restoring the saved sort on a direct list visit is a same-page update.
    // Use the CSS entry animation for these updates; don't take over document painting.
    if (shouldRemount && previousData.name && previousData.name !== nextData.name
      && startViewTransition && !reducedMotion && !transitionDocument?.hidden) {
      transitionDocument!.documentElement.dataset.pageTransition = direction;
      try {
        const viewTransition = startViewTransition(() => {
          // Skipping a transition doesn't cancel a callback that is still pending.
          if (transitionGenRef.current !== gen) return;
          flushSync(() => commitUpdate(true));
        });
        activeTransitionRef.current = viewTransition;
        void viewTransition.finished.catch(() => undefined).finally(clearTransition);
        return;
      } catch {
        // Fall back to the normal render if native transitions are unavailable.
      }
    }

    clearTransition();
    commitUpdate(false);
  }, []);
  const value = useMemo(() => ({ data, revision, transition, setData }), [data, revision, transition, setData]);
  const { t } = useI18n();

  const setRouteMap = useRouteStore((s) => s.setRouteMap);

  useEffect(() => {
    // Extract route_map from the injection data (it's at the top level, not in args)
    const injection = (window as any).__hydroInjection;
    if (injection?.route_map) {
      setRouteMap(injection.route_map);
    }
  }, [setRouteMap]);

  // Update document title
  useEffect(() => {
    const serverName = data.args?.UiContext?.serverName || 'Hydro';
    const domainName = data.args?.UiContext?.domainId !== 'system' ? data.args?.UiContext?.domain?.name : '';
    const pageTitle = t(getPageMetadata(data.name).title);

    if (data.name === 'homepage' || !data.name) {
      document.title = serverName;
    } else {
      document.title = [pageTitle, domainName, serverName].filter(Boolean).join(' - ');
    }
  }, [data.name, data.args?.UiContext, t]);

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

export function useSetPageData(): PageDataContextValue['setData'] {
  return usePageDataContext().setData;
}

export function usePageDataRevision(): number {
  return usePageDataContext().revision;
}

export function usePageTransition(): PageTransitionState {
  return usePageDataContext().transition;
}

export function useUiContext(): PageData['args']['UiContext'] {
  return usePageDataContext().data.args.UiContext;
}

export function useUserContext(): PageData['args']['UserContext'] {
  return usePageDataContext().data.args.UserContext;
}
