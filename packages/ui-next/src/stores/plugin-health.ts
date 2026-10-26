import { create } from 'zustand';

export const usePluginHealth = create<{ failed: string[], recordFailure: (name: string) => void }>((set) => ({
  failed: [],
  recordFailure: (name) => set((state) => state.failed.includes(name) ? state : { failed: [...state.failed, name] }),
}));
