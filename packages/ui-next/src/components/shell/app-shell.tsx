import { ShellOverlays } from '@/components/common/addon-slots';
import { PluginHealthNotice } from '@/components/feedback/plugin-health-notice';
import { Footer } from '@/components/navigation/footer';
import { TopNav } from '@/components/navigation/top-nav';
import { usePageDataRevision, usePageTransition } from '@/context/page-data';
import { useOptionalRouterState } from '@/context/router';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const revision = usePageDataRevision();
  const transition = usePageTransition();
  const routerState = useOptionalRouterState();
  const isNavigating = routerState?.loading ?? false;

  const stageClasses = ['hydro-page-stage'];
  if (revision > 0) {
    if (transition.viaViewTransition) {
      stageClasses.push('hydro-page-stage--vt');
    } else {
      stageClasses.push('hydro-page-transition');
      if (transition.direction === 'from-right') {
        stageClasses.push('hydro-page-transition--from-right');
      } else if (transition.direction === 'from-left') {
        stageClasses.push('hydro-page-transition--from-left');
      }
    }
  }

  return (
    <div className="hydro-app-surface relative isolate flex min-h-screen flex-col overflow-x-clip">
      {isNavigating && <div className="hydro-nav-progress" aria-hidden="true" />}
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
        <div key={revision} className={stageClasses.join(' ')}>
          <div className="hydro-container py-8 md:py-10">
            {children}
          </div>
        </div>
      </main>
      <footer className="relative z-10">
        <Footer />
      </footer>
      <ShellOverlays />
    </div>
  );
}
