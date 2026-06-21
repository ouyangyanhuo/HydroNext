/**
 * Paste Guard Plugin
 *
 * Restricts pasting content longer than 30 characters in the code editor
 * on problem detail pages (practice mode).
 *
 * Strategy: intercept Monaco's textarea by patching addEventListener on the
 * textarea prototype, so our capture listener is registered BEFORE Monaco's.
 * Also patch navigator.clipboard.readText as fallback.
 */

import type { PluginDefinition } from '@/registry/plugin';

const PASTE_LIMIT = 30;

function isTargetPage(): boolean {
  const path = window.location.pathname;
  return /^(\/d\/[^/]+)?\/p\/[^/]+$/.test(path);
}

function notifyOverLimit(length: number) {
  const notifStore = (window as any).__hydroNotificationStore;
  if (notifStore) {
    try {
      notifStore.getState().add({
        title: '粘贴内容超过限制',
        message: `粘贴内容不能超过 ${PASTE_LIMIT} 个字符（当前 ${length} 个字符）`,
        color: 'red',
      });
    } catch (e) {
      console.warn('[Hydro] Failed to show paste warning:', e);
    }
  }
}

function blockPaste(ev: Event) {
  if (!isTargetPage()) return;
  const text = (ev as ClipboardEvent).clipboardData?.getData('text/plain') || '';
  if (text.length > PASTE_LIMIT) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    notifyOverLimit(text.length);
  }
}

export const pasteGuardPlugin: PluginDefinition = {
  name: 'contest-settings.paste-guard',
  setup(_api) {
    if (typeof window === 'undefined') return;

    const origAddEventListener = HTMLTextAreaElement.prototype.addEventListener;
    const patchedTextareas = new WeakSet<HTMLTextAreaElement>();

    HTMLTextAreaElement.prototype.addEventListener = function (type: string, listener: any, options?: any) {
      if (type === 'paste' && this.classList.contains('inputarea') && !patchedTextareas.has(this)) {
        patchedTextareas.add(this);
        origAddEventListener.call(this, 'paste', blockPaste, true);
      }
      return origAddEventListener.call(this, type, listener, options);
    };

    const clipboard = navigator.clipboard;
    const origReadText = clipboard?.readText?.bind(clipboard);
    if (origReadText) {
      clipboard.readText = async () => {
        const text = await origReadText();
        if (isTargetPage() && text.length > PASTE_LIMIT) {
          notifyOverLimit(text.length);
          return '';
        }
        return text;
      };
    }

    document.addEventListener('paste', blockPaste, true);

    return () => {
      HTMLTextAreaElement.prototype.addEventListener = origAddEventListener;
      if (origReadText && clipboard) clipboard.readText = origReadText;
      document.removeEventListener('paste', blockPaste, true);
    };
  },
};
