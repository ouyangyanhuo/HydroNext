import { create } from 'zustand';
import { initialLang } from '@/globals';

export interface UserContext {
  _id: number;
  uname: string;
  mail?: string;
  priv: number;
  avatar: string;
  [key: string]: any;
}

export interface UiContext {
  cdn_prefix: string;
  url_prefix: string;
  ws_prefix: string;
  domainId: string;
  domain: { name: string, avatar?: string, [key: string]: any };
  [key: string]: any;
}

interface SessionStore {
  user: UserContext;
  ui: UiContext;
  theme: 'light' | 'dark';
  language: string;
  setSession(payload: { user: UserContext, ui: UiContext }): void;
  setTheme(theme: 'light' | 'dark'): void;
  setLanguage(lang: string): void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  user: { _id: 0, uname: 'Unknown User', priv: 0, avatar: '' },
  ui: {
    cdn_prefix: '/',
    url_prefix: '/',
    ws_prefix: '/',
    domainId: 'system',
    domain: { name: 'Hydro' },
  },
  theme: 'light',
  language: initialLang,
  setSession: ({ user, ui }) => {
    // Detect theme from UserContext or UiContext
    const theme = (user as any).theme || (ui as any).theme || 'light';
    const language = (user as any).viewLang || initialLang;
    set({ user, ui, theme: theme as 'light' | 'dark', language });
  },
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
}));
