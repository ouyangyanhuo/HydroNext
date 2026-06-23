import { Footer } from '@/components/navigation/footer';
import { TopNav } from '@/components/navigation/top-nav';
import { usePageData } from '@/context/page-data';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { name } = usePageData();

  return (
    <div className="hydro-app-surface flex min-h-screen flex-col">
      <header className="sticky top-0 z-50">
        <TopNav />
      </header>
      <main className="flex-1">
        <div
          key={name}
          className="hydro-container py-8 md:py-10"
          style={{ animation: 'hydro-fade-in 200ms var(--hydro-ease-out) both' }}
        >
          {children}
        </div>
      </main>
      <footer>
        <Footer />
      </footer>
    </div>
  );
}
