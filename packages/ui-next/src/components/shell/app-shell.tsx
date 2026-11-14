import { useState } from 'react';
import { ShellOverlays } from '@/components/common/addon-slots';
import { PluginHealthNotice } from '@/components/feedback/plugin-health-notice';
import { Footer } from '@/components/navigation/footer';
import { TopNav } from '@/components/navigation/top-nav';
import { usePageData, usePageDataRevision } from '@/context/page-data';
import { useOptionalRouterState } from '@/context/router';
import { PERM, useHasPerm } from '@/hooks/use-permission';
import { useDomainNavigationPreview } from '@/stores/domain-navigation-preview';
import { useSessionStore } from '@/stores/session';
import { getTopNavIndex } from '@/utils/top-nav';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const revision = usePageDataRevision();
  const { name } = usePageData();
  const routerState = useOptionalRouterState();
  const isNavigating = routerState?.loading ?? false;

  const domainId = useSessionStore((s) => s.ui.domainId);
  const savedNavigationHidden = useSessionStore((s) => s.ui.domain?.navigationHidden);
  const savedContestMode = useSessionStore((s) => s.ui.domain?.contestMode === true);
  const savedContestFocus = useSessionStore((s) => s.ui.domain?.contestFocus);
  const preview = useDomainNavigationPreview((s) => s.preview?.domainId === domainId ? s.preview : null);
  const navigationHidden = preview ? preview.navigationHidden : savedNavigationHidden;
  const contestMode = preview ? preview.contestMode : savedContestMode;
  const focus = preview ? preview.contestFocus : savedContestFocus;
  const focusContest = contestMode && typeof focus === 'string' && /^[a-f\d]{24}$/i.test(focus) ? focus : '';
  const canViewRanking = useHasPerm(PERM.PERM_VIEW_RANKING);
  const canViewContestRanking = useHasPerm(PERM.PERM_VIEW_CONTEST_SCOREBOARD);

  const currNavIndex = getTopNavIndex(name, {
    navigationHidden,
    contestMode,
    focusContest,
    canViewRanking,
    canViewContestRanking,
  });

  const [state, setState] = useState({
    revision,
    prevNavIndex: currNavIndex,
    modifier: '',
  });

  if (state.revision !== revision) {
    const prevNavIndex = state.prevNavIndex;
    let modifier = '';
    if (prevNavIndex !== null && currNavIndex !== null && prevNavIndex !== currNavIndex) {
      modifier = currNavIndex > prevNavIndex
        ? ' hydro-page-transition--from-right'
        : ' hydro-page-transition--from-left';
    }
    setState({
      revision,
      prevNavIndex: currNavIndex,
      modifier,
    });
  }

  const transitionModifier = state.revision === revision ? state.modifier : '';
  const exitingClass = isNavigating ? ' hydro-page-exiting' : '';

  return (
    <div className="hydro-app-surface relative isolate flex min-h-screen flex-col overflow-x-clip">
      <div className="hydro-ambient" aria-hidden="true">
        <div className="hydro-ambient__origin hydro-ambient__origin--primary">
          <span className="hydro-ambient__wash hydro-ambient__wash--primary" />
          <span className="hydro-ambient__ripple hydro-ambient__ripple--1" />
          <span className="hydro-ambient__ripple hydro-ambient__ripple--2" />
          <span className="hydro-ambient__standing" />
        </div>
      </div>
      <header className="sticky top-0 z-50">
        <TopNav />
      </header>
      <PluginHealthNotice />
      <main className="relative z-10 flex-1 overflow-x-clip">
        <div
          key={revision}
          className={`hydro-page-transition${transitionModifier}${exitingClass} hydro-container py-8 md:py-10`}
        >
          {children}
        </div>
      </main>
      <footer className="relative z-10">
        <Footer />
      </footer>
      <ShellOverlays />
    </div>
  );
}
