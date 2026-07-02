import { create } from 'zustand';
import { initialPage, routeMapStore } from '@/globals';

interface RouteStore {
  routeMap: Record<string, string>;
  pageName: string;
  url: string;
  setRouteMap(map: Record<string, string>): void;
  setPage(name: string, url: string): void;
}

export const useRouteStore = create<RouteStore>((set) => ({
  routeMap: routeMapStore.getSnapshot(),
  pageName: initialPage.name,
  url: initialPage.url,
  setRouteMap: (routeMap) => set({ routeMap }),
  setPage: (pageName, url) => set({ pageName, url }),
}));
