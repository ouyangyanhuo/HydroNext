/** Optional code-editor paste length policy; not a server-side security boundary. */

import {
  hasPermValue, hasPrivValue, PERM, type PluginDefinition, PRIV, translate, useNotificationStore, useSessionStore,
} from '@hydrooj/ui-next';
import { resolvePasteLimit } from '../config';
import { getPasteCharacterCount } from './limit';

export function canPasteCode() {
  const user = useSessionStore.getState().user;
  return hasPermValue(user.perm, PERM.PERM_EDIT_PROBLEM)
    || hasPermValue(user.perm, PERM.PERM_EDIT_DOMAIN)
    || hasPrivValue(user.priv, PRIV.PRIV_EDIT_SYSTEM)
    || hasPrivValue(user.priv, PRIV.PRIV_UNLIMITED_ACCESS);
}

export function isProblemCodeEditorPaste(event: Event) {
  if (!/^(?:\/d\/[^/]+)?\/(?:p\/[^/]+(?:\/submit)?|(?:contest|homework)\/[^/]+\/p\/[^/]+)\/?$/.test(window.location.pathname)) return false;
  const target = event.target;
  return target instanceof Element && Boolean(target.closest('.monaco-editor'));
}

function notifyPasteBlocked(length: number, limit: number) {
  try {
    useNotificationStore.getState().add({
      title: translate('Paste limit exceeded'),
      message: limit === 0 ? translate('Pasting code is disabled.') : translate(
        'Pasting more than {0} characters is not allowed (currently {1}).',
        limit,
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
  const limit = resolvePasteLimit(useSessionStore.getState().ui?.editorPasteLimit);
  if (limit === -1) return;
  const text = event.clipboardData?.getData('text/plain') || '';
  const length = getPasteCharacterCount(text);
  if (limit !== 0 && length <= limit) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  notifyPasteBlocked(length, limit);
}

export function setup(_api: Parameters<PluginDefinition['setup']>[0]) {
  if (typeof document === 'undefined') return undefined;
  document.addEventListener('paste', blockPaste, true);
  return () => document.removeEventListener('paste', blockPaste, true);
}
