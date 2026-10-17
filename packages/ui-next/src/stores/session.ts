import { create } from 'zustand';
import { initialLang, initialPage } from '@/globals';
import { type AccentColorValue, DEFAULT_ACCENT } from '@/styles/accent-colors';
import type { HonorFrame } from '@/utils/honor-frame';

export type ThemeMode = 'light' | 'dark';
export type FontFamily = 'sans' | 'serif';

export interface UserContext {
  _id: number;
  uname: string;
  mail?: string;
  priv: number;
  perm?: number | string;
  avatar: string;
  honorFrame?: HonorFrame | null;
  [key: string]: any;
}

export interface UiContext {
  cdn_prefix: string;
  url_prefix: string;
  ws_prefix: string;
  domainId: string;
  domain: { name: string, avatar?: string, [key: string]: any };
  serverName: string;
  registrationEnabled?: boolean;
  passwordResetEnabled?: boolean;
  [key: string]: any;
}

interface SessionStore {
  user: UserContext;
  ui: UiContext;
  theme: ThemeMode;
  autoTheme: boolean;
  accentColor: AccentColorValue;
  fontFamily: FontFamily;
  language: string;
  setSession(payload: { user: UserContext, ui: UiContext }): void;
  setTheme(theme: ThemeMode): void;
  setAutoTheme(enabled: boolean): void;
  syncAutoTheme(): void;
  setAccentColor(color: AccentColorValue): void;
  setFontFamily(font: FontFamily): void;
  setLanguage(lang: string): void;
}

const THEME_STORAGE_KEY = 'hydro-ui-theme';
const AUTO_THEME_STORAGE_KEY = 'hydro-ui-auto-theme';
const ACCENT_STORAGE_KEY = 'hydro-ui-accent-color';
const FONT_STORAGE_KEY = 'hydro-ui-font-family';

const initialUser: UserContext = initialPage.args?.UserContext as UserContext ?? {
  _id: 0,
  uname: 'Unknown User',
  priv: 0,
  avatar: '',
};
const initialUi: UiContext = initialPage.args?.UiContext as UiContext ?? {
  cdn_prefix: '/',
  url_prefix: '/',
  ws_prefix: '/',
  domainId: 'system',
  domain: { name: 'Hydro' },
  serverName: 'Hydro',
};

function normalizeTheme(value: unknown): ThemeMode | null {
  // Migrate the removed mode without losing an existing manual preference.
  if (value === 'paper') return 'light';
  return value === 'dark' || value === 'light' ? value : null;
}

function writeStoredTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function readStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const theme = normalizeTheme(stored);
    if (theme && stored !== theme) writeStoredTheme(theme);
    return theme;
  } catch {
    return null;
  }
}

function readStoredAutoTheme(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const value = window.localStorage.getItem(AUTO_THEME_STORAGE_KEY);
    return value === null ? true : value === 'true';
  } catch {
    return true;
  }
}

function writeStoredAutoTheme(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTO_THEME_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export function getSystemTheme(): ThemeMode {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
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
  if (typeof window === 'undefined') return 'serif';
  try {
    const value = window.localStorage.getItem(FONT_STORAGE_KEY);
    if (value === 'serif' || value === 'sans') return value;
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
  return 'serif';
}

function writeStoredFont(font: FontFamily) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FONT_STORAGE_KEY, font);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

const initialAutoTheme = readStoredAutoTheme();
const storedTheme = readStoredTheme();

export const useSessionStore = create<SessionStore>((set, get) => ({
  user: initialUser,
  ui: initialUi,
  theme: initialAutoTheme
    ? getSystemTheme()
    : (
      storedTheme
      || normalizeTheme(initialUser.theme)
      || normalizeTheme(initialUi.theme)
      || 'light'
    ),
  autoTheme: initialAutoTheme,
  accentColor: readStoredAccent(),
  fontFamily: readStoredFont(),
  language: initialUser.viewLang || initialLang,
  setSession: ({ user, ui }) => {
    const language = (user as any).viewLang || initialLang;
    // Appearance is browser-local, not reset by navigation, login or server preferences.
    set({ user, ui, language });
  },
  setTheme: (theme) => {
    writeStoredTheme(theme);
    writeStoredAutoTheme(false);
    set({ theme, autoTheme: false });
  },
  setAutoTheme: (autoTheme) => {
    writeStoredAutoTheme(autoTheme);
    if (autoTheme) {
      set({ autoTheme, theme: getSystemTheme() });
    } else {
      writeStoredTheme(get().theme);
      set({ autoTheme });
    }
  },
  syncAutoTheme: () => {
    if (!get().autoTheme) return;
    const theme = getSystemTheme();
    if (get().theme !== theme) set({ theme });
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
