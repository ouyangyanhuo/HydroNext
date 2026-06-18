import { Footer } from '@/components/navigation/footer';
import { TopNav } from '@/components/navigation/top-nav';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="hydro-app-surface flex min-h-screen flex-col">
      <header className="sticky top-0 z-50">
        <TopNav />
      </header>
      <main className="flex-1">
        <div className="hydro-container py-8 md:py-10">
          {children}
        </div>
      </main>
      <footer>
        <Footer />
      </footer>
    </div>
  );
}
