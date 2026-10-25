import { ShellOverlays } from '@/components/common/addon-slots';
import { Footer } from '@/components/navigation/footer';
import { TopNav } from '@/components/navigation/top-nav';
import { usePageData } from '@/context/page-data';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { name } = usePageData();

  return (
    <div className="hydro-app-surface relative isolate flex min-h-screen flex-col">
      <div className="hydro-ambient" aria-hidden="true">
        <div className="hydro-ambient__origin hydro-ambient__origin--primary">
          <span className="hydro-ambient__wash hydro-ambient__wash--primary" />
          <span className="hydro-ambient__ripple hydro-ambient__ripple--1" />
          <span className="hydro-ambient__ripple hydro-ambient__ripple--2" />
          <span className="hydro-ambient__standing" />
        </div>
        <div className="hydro-ambient__origin hydro-ambient__origin--secondary">
          <span className="hydro-ambient__wash hydro-ambient__wash--secondary" />
          <span className="hydro-ambient__ripple hydro-ambient__ripple--counter" />
        </div>
      </div>
      <header className="sticky top-0 z-50">
        <TopNav />
      </header>
      <main className="relative z-10 flex-1">
        <div
          key={name}
          className="hydro-container py-8 md:py-10"
          style={{ animation: 'hydro-fade-in 200ms var(--hydro-ease-out) both' }}
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
