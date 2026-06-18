/**
 * Paste Guard Plugin
 *
 * Restricts pasting content longer than 30 characters in the code editor
 * on problem detail pages (practice mode). This is a contest-settings feature
 * to prevent students from pasting large blocks of code.
 */

import type { PluginDefinition } from '@/registry/plugin';

const PASTE_LIMIT = 30;
const PROBLEM_PAGES = ['problem_detail', 'contest_detail_problem', 'homework_detail_problem'];

function isTargetPage(): boolean {
  const pageName = (window as any).__hydroInjection?.name || '';
  return PROBLEM_PAGES.includes(pageName);
}

export const pasteGuardPlugin: PluginDefinition = {
  name: 'contest-settings.paste-guard',
  setup(_api) {
    if (typeof window === 'undefined') return;

    const handler = (ev: ClipboardEvent) => {
      if (!isTargetPage()) return;

      const target = ev.target as HTMLElement;
      if (!target) return;
      const tagName = target.tagName.toLowerCase();
      const isEditor = tagName === 'textarea'
        || target.closest('.monaco-editor')
        || target.closest('[data-editor]')
        || target.classList.contains('CodeMirror');

      if (!isEditor) return;

      const text = ev.clipboardData?.getData('text/plain') || '';
      if (text.length > PASTE_LIMIT) {
        ev.preventDefault();
        ev.stopPropagation();

        const notifStore = (window as any).__hydroNotificationStore;
        if (notifStore) {
          notifStore.getState().add({
            title: '粘贴内容超过限制',
            message: `粘贴内容不能超过 ${PASTE_LIMIT} 个字符（当前 ${text.length} 个字符）`,
            color: 'red',
          });
        }
      }
    };

    document.addEventListener('paste', handler, true);

    return () => {
      document.removeEventListener('paste', handler, true);
    };
  },
};
