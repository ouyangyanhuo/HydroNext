import { useSyncExternalStore } from 'react';

export interface ManageEntry {
  to: string;
  title: string;
  desc: string;
  group: string;
  order?: number;
}

const entries = new Map<string, ManageEntry>();
const listeners = new Set<() => void>();
let snapshot: readonly ManageEntry[] = [];
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = () => snapshot;
function publish() {
  snapshot = [...entries.values()];
  for (const listener of listeners) listener();
}

export function registerManageEntry(entry: ManageEntry) {
  if (entries.has(entry.to)) throw new Error(`Duplicate management entry: ${entry.to}`);
  const stored = { ...entry };
  entries.set(entry.to, stored);
  publish();
  return () => {
    if (entries.get(entry.to) !== stored) return;
    entries.delete(entry.to);
    publish();
  };
}

export function useManageEntries() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
