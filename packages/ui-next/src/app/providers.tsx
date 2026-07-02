import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { useEffect, useMemo } from 'react';
import { HydroNotifications } from '@/components/feedback/hydro-notifications';
import { useSessionStore } from '@/stores/session';
import { ACCENT_PRESETS, accentToCssVars, getAccentScheme } from '@/styles/accent-colors';
import { createDynamicTheme } from '@/styles/mantine-theme';

const SANS_FONT_STACK = [
  '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'Roboto', "'Helvetica Neue'",
  'Arial', "'Noto Sans'", 'sans-serif', "'Apple Color Emoji'", "'Segoe UI Emoji'",
].join(', ');

export function Providers({ children }: { children: React.ReactNode }) {
  const colorScheme = useSessionStore((s) => s.theme);
  const autoTheme = useSessionStore((s) => s.autoTheme);
  const syncAutoTheme = useSessionStore((s) => s.syncAutoTheme);
  const accentColor = useSessionStore((s) => s.accentColor);
  const fontFamily = useSessionStore((s) => s.fontFamily);
  const isDark = colorScheme === 'dark';
  const isPaper = colorScheme === 'paper';
  const isPreset = accentColor in ACCENT_PRESETS;
  const palette = isPreset
    ? getAccentScheme(accentColor)[isDark ? 'dark' : 'light']
    : null;
  const { theme: dynamicTheme, cssResolver } = useMemo(
    () => createDynamicTheme(isPaper ? '#7a6240' : accentColor),
    [accentColor, isPaper],
  );

  useEffect(() => {
    if (!autoTheme) return undefined;

    syncAutoTheme();
    const timer = window.setInterval(syncAutoTheme, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncAutoTheme();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', syncAutoTheme);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', syncAutoTheme);
    };
  }, [autoTheme, syncAutoTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (!isPaper) {
      if (palette) {
        const vars = accentToCssVars(palette);
        for (const [key, value] of Object.entries(vars)) {
          root.style.setProperty(key, value);
        }
      } else {
        root.style.setProperty('--hydro-primary', accentColor);
        root.style.setProperty('--hydro-primary-strong', accentColor);
        root.style.setProperty('--hydro-primary-soft', `${accentColor}18`);
        root.style.setProperty('--hydro-accent', accentColor);
        root.style.setProperty('--hydro-accent-soft', `${accentColor}18`);
      }
    } else {
      const keys = ['--hydro-primary', '--hydro-primary-strong', '--hydro-primary-soft', '--hydro-accent', '--hydro-accent-soft'];
      for (const key of keys) root.style.removeProperty(key);
    }
    if (isPaper) {
      root.setAttribute('data-hydro-theme', 'paper');
    } else {
      root.removeAttribute('data-hydro-theme');
    }
    return () => {
      const keys = ['--hydro-primary', '--hydro-primary-strong', '--hydro-primary-soft', '--hydro-accent', '--hydro-accent-soft'];
      for (const key of keys) root.style.removeProperty(key);
      root.removeAttribute('data-hydro-theme');
    };
  }, [accentColor, palette, isDark, isPaper]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--hydro-font-family', fontFamily === 'serif'
      ? 'var(--hydro-font-serif)'
      : SANS_FONT_STACK);
  }, [fontFamily]);

  return (
    <MantineProvider
      theme={dynamicTheme}
      cssVariablesResolver={cssResolver}
      forceColorScheme={colorScheme === 'paper' ? 'light' : colorScheme}
    >
      <Notifications position="top-right" />
      <HydroNotifications />
      {children}
    </MantineProvider>
  );
}
