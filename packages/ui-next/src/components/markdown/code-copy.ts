const ICON_START = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"'
  + ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const COPY_ICON = `${ICON_START}<rect x="8" y="8" width="12" height="12" rx="2"/>`
  + '<path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const COPIED_ICON = `${ICON_START}<path d="m5 12 4 4 10-10"/></svg>`;

/** Preserve whitespace and support HTTP development servers without Clipboard API. */
export async function copyCodeText(text: string, document: Document) {
  const clipboard = document.defaultView?.navigator.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return;
  }
  const active = document.activeElement as HTMLElement | null;
  const selection = document.getSelection();
  const ranges = Array.from({ length: selection?.rangeCount || 0 }, (_, index) => selection!.getRangeAt(index).cloneRange());
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand?.('copy')) throw new Error('Copy failed');
  } finally {
    field.remove();
    active?.focus({ preventScroll: true });
    if (selection && ranges.length) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
  }
}

/** Enhance rendered Markdown only; cleanup also handles React StrictMode re-runs. */
export function attachCodeCopyButtons(root: HTMLElement, labels: { copy: string, copied: string }, onError: () => void) {
  const document = root.ownerDocument;
  const cleanups: (() => void)[] = [];
  root.querySelectorAll('pre').forEach((pre) => {
    const parent = pre.parentElement;
    if (!parent || parent.classList.contains('code-block-copyable')) return;
    const needsWrapper = !parent.classList.contains('code-block-wrapper');
    const wrapper = needsWrapper ? document.createElement('div') : parent;
    if (needsWrapper) {
      wrapper.className = 'code-block-wrapper';
      pre.before(wrapper);
      wrapper.append(pre);
    }
    wrapper.classList.add('code-block-copyable');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy-button hydro-button-feedback hydro-button-base';
    const showState = (copied: boolean) => {
      button.innerHTML = copied ? COPIED_ICON : COPY_ICON;
      button.title = copied ? labels.copied : labels.copy;
      button.setAttribute('aria-label', button.title);
      button.dataset.copied = String(copied);
    };
    showState(false);
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleClick = async () => {
      button.disabled = true;
      try {
        await copyCodeText((pre.querySelector('code') || pre).textContent || '', document);
        if (disposed) return;
        showState(true);
        clearTimeout(timer);
        timer = setTimeout(() => showState(false), 1500);
      } catch {
        if (!disposed) onError();
      } finally {
        if (!disposed) button.disabled = false;
      }
    };
    button.addEventListener('click', handleClick);
    wrapper.append(button);
    cleanups.push(() => {
      disposed = true;
      clearTimeout(timer);
      button.removeEventListener('click', handleClick);
      button.remove();
      wrapper.classList.remove('code-block-copyable');
      if (needsWrapper) wrapper.replaceWith(pre);
    });
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}
