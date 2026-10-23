import { create } from 'zustand';

interface NavigationPreview {
  owner: symbol;
  domainId: string;
  navigationHidden: Record<string, boolean>;
  contestMode: boolean;
  contestFocus?: string;
}

interface NavigationPreviewStore {
  preview: NavigationPreview | null;
  setPreview: (preview: NavigationPreview) => void;
  clearPreview: (owner: symbol) => void;
}

/** Page-local preview only: never persisted or merged into the server session. */
export const useDomainNavigationPreview = create<NavigationPreviewStore>((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
  clearPreview: (owner) => set((state) => state.preview?.owner === owner ? { preview: null } : state),
}));
