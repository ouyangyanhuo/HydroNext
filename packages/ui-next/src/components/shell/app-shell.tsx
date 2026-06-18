import { Footer } from '@/components/navigation/footer';
import { TopNav } from '@/components/navigation/top-nav';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 h-12">
        <TopNav />
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6">
          {children}
        </div>
      </main>
      <footer className="h-[60px]">
        <Footer />
      </footer>
    </div>
  );
}
