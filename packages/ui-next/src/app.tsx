import { Suspense, useMemo, useSyncExternalStore } from 'react';
import { Providers } from './app/providers';
import { PageLoading } from './components/feedback/page-loading';
import { AppShell } from './components/shell/app-shell';
import { usePageData } from './context/page-data';
import { defineSlot, SlotName } from './registry';
import { SlotErrorBoundary } from './registry/error-boundary';
import { store } from './registry/store';

const PageRenderer = defineSlot('app:page-renderer', () => {
  const { name } = usePageData();
  const slotName: SlotName = `page:${name}`;

  const [subscribe, getSnapshot] = useMemo(
    () => [
      (cb: () => void) => store.subscribe(slotName, cb),
      () => store.getVersion(slotName),
    ],
    [slotName],
  );

  useSyncExternalStore(subscribe, getSnapshot);

  const Comp = store.getDefault(slotName);

  if (!Comp) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold text-[var(--hydro-text)]">
          Page not found
        </h2>
        <p className="mt-2 text-[var(--hydro-text-muted)]">
          The page <code className="px-1 py-0.5 rounded bg-[var(--hydro-surface-muted)]">{name}</code> is not implemented yet.
        </p>
      </div>
    );
  }

  return (
    <SlotErrorBoundary slotName={slotName} label="renderer">
      <Suspense fallback={<PageLoading />}>
        <Comp />
      </Suspense>
    </SlotErrorBoundary>
  );
});

const App = defineSlot('app:root', () => {
  return (
    <Providers>
      <AppShell>
        <PageRenderer />
      </AppShell>
    </Providers>
  );
});

export default App;
