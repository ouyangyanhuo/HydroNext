import { create } from 'zustand';
import { initialLang } from '@/globals';

export type ThemeMode = 'light' | 'dark';

export interface UserContext {
  _id: number;
  uname: string;
  mail?: string;
  priv: number;
  perm?: number | string;
  avatar: string;
  [key: string]: any;
}

export interface UiContext {
  cdn_prefix: string;
  url_prefix: string;
  ws_prefix: string;
  domainId: string;
  domain: { name: string, avatar?: string, [key: string]: any };
  serverName: string;
  [key: string]: any;
}

interface SessionStore {
  user: UserContext;
  ui: UiContext;
  theme: ThemeMode;
  language: string;
  setSession(payload: { user: UserContext, ui: UiContext }): void;
  setTheme(theme: ThemeMode): void;
  setLanguage(lang: string): void;
}

const THEME_STORAGE_KEY = 'hydro-ui-theme';

function normalizeTheme(value: unknown): ThemeMode | null {
  return value === 'dark' || value === 'light' ? value : null;
}

function readStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export const useSessionStore = create<SessionStore>((set) => ({
  user: { _id: 0, uname: 'Unknown User', priv: 0, avatar: '' },
  ui: {
    cdn_prefix: '/',
    url_prefix: '/',
    ws_prefix: '/',
    domainId: 'system',
    domain: { name: 'Hydro' },
    serverName: 'Hydro',
  },
  theme: readStoredTheme() || 'light',
  language: initialLang,
  setSession: ({ user, ui }) => {
    const theme = readStoredTheme()
      || normalizeTheme((user as any).theme)
      || normalizeTheme((ui as any).theme)
      || 'light';
    const language = (user as any).viewLang || initialLang;
    set({ user, ui, theme, language });
  },
  setTheme: (theme) => {
    writeStoredTheme(theme);
    set({ theme });
  },
  setLanguage: (language) => set({ language }),
}));
