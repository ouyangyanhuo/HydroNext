import { create } from 'zustand';
import { initialLang } from '@/globals';
import { type AccentColorValue, DEFAULT_ACCENT } from '@/styles/accent-colors';

export type ThemeMode = 'light' | 'dark';
export type FontFamily = 'sans' | 'serif';

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
  accentColor: AccentColorValue;
  fontFamily: FontFamily;
  language: string;
  setSession(payload: { user: UserContext, ui: UiContext }): void;
  setTheme(theme: ThemeMode): void;
  setAccentColor(color: AccentColorValue): void;
  setFontFamily(font: FontFamily): void;
  setLanguage(lang: string): void;
}

const THEME_STORAGE_KEY = 'hydro-ui-theme';
const ACCENT_STORAGE_KEY = 'hydro-ui-accent-color';
const FONT_STORAGE_KEY = 'hydro-ui-font-family';

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

function readStoredAccent(): AccentColorValue {
  if (typeof window === 'undefined') return DEFAULT_ACCENT;
  try {
    const value = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    if (value) return value as AccentColorValue;
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
  return DEFAULT_ACCENT;
}

function writeStoredAccent(color: AccentColorValue) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, color);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function readStoredFont(): FontFamily {
  if (typeof window === 'undefined') return 'sans';
  try {
    const value = window.localStorage.getItem(FONT_STORAGE_KEY);
    if (value === 'serif' || value === 'sans') return value;
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
  return 'sans';
}

function writeStoredFont(font: FontFamily) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FONT_STORAGE_KEY, font);
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
  accentColor: readStoredAccent(),
  fontFamily: readStoredFont(),
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
  setAccentColor: (accentColor) => {
    writeStoredAccent(accentColor);
    set({ accentColor });
  },
  setFontFamily: (fontFamily) => {
    writeStoredFont(fontFamily);
    set({ fontFamily });
  },
  setLanguage: (language) => set({ language }),
}));
