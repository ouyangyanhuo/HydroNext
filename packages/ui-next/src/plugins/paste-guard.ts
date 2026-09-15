/** Prevent participants from pasting into the problem code editor. */

import { localeData } from '@/globals';
import {
  PERM, PRIV, hasPermValue, hasPrivValue,
} from '@/hooks/use-permission';
import type { PluginDefinition } from '@/registry/plugin';
import { useSessionStore } from '@/stores/session';
import {
  CODE_PASTE_LIMIT, getPasteCharacterCount, isCodePasteOverLimit,
} from '@/utils/paste-limit';

function translate(key: string, ...args: Array<string | number>) {
  const windowLocales = (window as any).LOCALES as Record<string, string> | undefined;
  let text = localeData[key] || windowLocales?.[key] || key;
  args.forEach((arg, index) => {
    text = text.replaceAll(`{${index}}`, String(arg));
  });
  return text;
}

export function canPasteCode() {
  const user = useSessionStore.getState().user;
  return hasPermValue(user.perm, PERM.PERM_EDIT_PROBLEM)
    || hasPermValue(user.perm, PERM.PERM_EDIT_DOMAIN)
    || hasPrivValue(user.priv, PRIV.PRIV_EDIT_SYSTEM)
    || hasPrivValue(user.priv, PRIV.PRIV_UNLIMITED_ACCESS);
}

export function isProblemCodeEditorPaste(event: Event) {
  if (!/^(?:\/d\/[^/]+)?\/p\/[^/]+$/.test(window.location.pathname)) return false;
  const target = event.target;
  return target instanceof Element && Boolean(target.closest('.monaco-editor'));
}

function notifyPasteBlocked(length: number) {
  try {
    window.__hydroNotificationStore?.getState().add({
      title: translate('Paste limit exceeded'),
      message: translate(
        'Pasting more than {0} characters is not allowed (currently {1}).',
        CODE_PASTE_LIMIT,
        length,
      ),
      color: 'red',
    });
  } catch (error) {
    console.warn('[Hydro] Failed to show paste warning:', error);
  }
}

function blockPaste(event: ClipboardEvent) {
  if (canPasteCode() || !isProblemCodeEditorPaste(event)) return;
  const text = event.clipboardData?.getData('text/plain') || '';
  if (!isCodePasteOverLimit(text)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  notifyPasteBlocked(getPasteCharacterCount(text));
}

export const pasteGuardPlugin: PluginDefinition = {
  name: 'editor.paste-guard',
  setup() {
    if (typeof window === 'undefined') return undefined;
    document.addEventListener('paste', blockPaste, true);
    return () => document.removeEventListener('paste', blockPaste, true);
  },
};
