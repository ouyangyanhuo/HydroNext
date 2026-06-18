import { AppShell as MantineAppShell } from '@mantine/core';
import { Footer } from '@/components/navigation/footer';
import { TopNav } from '@/components/navigation/top-nav';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <MantineAppShell>
      <MantineAppShell.Header>
        <TopNav />
      </MantineAppShell.Header>
      <MantineAppShell.Main className="min-h-screen">
        <div className="mx-auto max-w-7xl px-4 py-6">
          {children}
        </div>
      </MantineAppShell.Main>
      <MantineAppShell.Footer>
        <Footer />
      </MantineAppShell.Footer>
    </MantineAppShell>
  );
}
