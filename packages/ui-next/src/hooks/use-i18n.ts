import { useCallback } from 'react';
import { useSessionStore } from '@/stores/session';
import { localeData } from '@/globals';

// Merge all locale sources: injected locale + window.LOCALES (from lang-*.js if loaded)
function getLocale(): Record<string, string> {
    const winLocales = (window as any).LOCALES || {};
    return { ...winLocales, ...localeData };
}

export function useI18n() {
    const language = useSessionStore((s) => s.language);

    const t = useCallback(
        (key: string, ...args: any[]): string => {
            const locale = getLocale();
            let text = locale[key] || key;
            // Replace {0}, {1}, ... positional placeholders
            if (args.length > 0 && typeof args[0] !== 'object') {
                args.forEach((arg: any, i: number) => {
                    text = text.replace(new RegExp(`\\{${i}\\}`, 'g'), String(arg));
                });
            }
            // Replace {name} style placeholders
            if (args.length > 0 && typeof args[0] === 'object') {
                for (const [k, v] of Object.entries(args[0])) {
                    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
                }
            }
            return text;
        },
        [language],
    );

    return { t, language };
}
