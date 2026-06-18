import { create } from 'zustand';

interface AppStore {
  navigating: boolean;
  error: Error | null;
  setNavigating(value: boolean): void;
  setError(error: Error | null): void;
}

export const useAppStore = create<AppStore>((set) => ({
  navigating: false,
  error: null,
  setNavigating: (navigating) => set({ navigating }),
  setError: (error) => set({ error }),
}));
