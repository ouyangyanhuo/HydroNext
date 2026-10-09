import { ContestAnnouncements } from '@/components/contest/contest-announcements';
import { Footer } from '@/components/navigation/footer';
import { TopNav } from '@/components/navigation/top-nav';
import { usePageData } from '@/context/page-data';
import { useSessionStore } from '@/stores/session';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { name } = usePageData();
  const uid = useSessionStore((state) => state.user._id);

  return (
    <div className="hydro-app-surface relative isolate flex min-h-screen flex-col">
      <div className="hydro-ambient" aria-hidden="true">
        <div className="hydro-ambient__origin">
          <span className="hydro-ambient__wash" />
          <span className="hydro-ambient__ripple" />
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
      {uid > 0 && <ContestAnnouncements key={uid} />}
    </div>
  );
}
