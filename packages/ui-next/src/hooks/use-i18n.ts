import { useCallback } from 'react';
import { localeData } from '@/globals';
import { useSessionStore } from '@/stores/session';

function getTranslation(key: string) {
  const winLocales = (window as any).LOCALES as Record<string, string> | undefined;
  return localeData[key] || winLocales?.[key];
}

export function useI18n() {
  const language = useSessionStore((s) => s.language);

  const t = useCallback(
    (key: string, ...args: any[]): string => {
      let text = getTranslation(key) || key;
      // Replace {0}, {1}, ... positional placeholders
      if (args.length > 0 && typeof args[0] !== 'object') {
        args.forEach((arg: any, i: number) => {
          text = text.replaceAll(`{${i}}`, String(arg));
        });
      }
      // Replace {name} style placeholders
      if (args.length > 0 && typeof args[0] === 'object') {
        for (const [k, v] of Object.entries(args[0])) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [],
  );

  return { t, language };
}
