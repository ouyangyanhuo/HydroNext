import { useCallback } from 'react';
import { useSessionStore } from '@/stores/session';

export function useI18n() {
    const language = useSessionStore((s) => s.language);

    const t = useCallback(
        (key: string, ...args: any[]): string => {
            const locale = (window as any).__hydroLocale || {};
            let text = locale[key] || key;
            // Replace {0}, {1}, ... positional placeholders
            if (args.length > 0 && typeof args[0] !== 'object') {
                args.forEach((arg: any, i: number) => {
                    text = text.replace(`{${i}}`, String(arg));
                });
            }
            // Replace {name} style placeholders
            if (args.length > 0 && typeof args[0] === 'object') {
                for (const [k, v] of Object.entries(args[0])) {
                    text = text.replace(`{${k}}`, String(v));
                }
            }
            return text;
        },
        [language],
    );

    return { t, language };
}
