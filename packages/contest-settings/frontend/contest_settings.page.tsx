import {
  $, NamedPage, Notification, addPage, ctx, i18n,
} from '@hydrooj/ui-default';

const PROBLEM_PAGES = ['problem_detail', 'contest_detail_problem', 'homework_detail_problem'];
const PASTE_LIMIT = 30;

function setupPasteRestriction() {
  // Attach to document (capture phase) so we fire BEFORE Monaco's own
  // capture listener on editor.getDomNode(). Same-element capture listeners
  // fire in registration order, and Monaco registers its first.
  document.addEventListener('paste', (ev: ClipboardEvent) => {
    const scratchpad = (ctx as any).scratchpad;
    const editor = scratchpad?.editor;
    if (!editor || !editor.hasTextFocus()) return;

    const text = ev.clipboardData?.getData('text/plain') || '';
    if (text.length > PASTE_LIMIT) {
      ev.preventDefault();
      ev.stopPropagation();
      Notification.error(i18n('Paste limit exceeded'));
    }
  }, true);
}

function autoEnterScratchpad() {
  // Wait for the scratchpad button to be available
  const check = setInterval(() => {
    const btn = document.querySelector('[name="problem-sidebar__open-scratchpad"]');
    if (btn) {
      clearInterval(check);
      (btn as HTMLElement).click();
    }
  }, 200);
  // Timeout after 10 seconds
  setTimeout(() => clearInterval(check), 10000);
}

addPage(new NamedPage(PROBLEM_PAGES, () => {
  autoEnterScratchpad();
  setupPasteRestriction();
}));
