import './contest_settings.page.css';

import {
  $, addPage, AutoloadPage, ctx, i18n, NamedPage, Notification,
} from '@hydrooj/ui-default';

const PROBLEM_PAGES = ['problem_detail', 'contest_detail_problem', 'homework_detail_problem'];
const PASTE_LIMIT = 30;
const TAB_INDICATOR_CLASS = 'contest-settings-tab-indicator';
let mainRowAbortController: AbortController | null = null;

function installModernShell() {
  document.documentElement.classList.add('contest-settings-modern');
}

function getActiveTab(header: HTMLElement) {
  return header.querySelector<HTMLElement>('.section__tab-header-item.selected')
    || header.querySelector<HTMLElement>('.section__tab-header-item.tab--active')
    || header.querySelector<HTMLElement>('.section__tab-header-item');
}

function syncTabIndicator(header: HTMLElement) {
  const activeTab = getActiveTab(header);
  if (!activeTab) return;

  let indicator = header.querySelector<HTMLElement>(`.${TAB_INDICATOR_CLASS}`);
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = TAB_INDICATOR_CLASS;
    indicator.setAttribute('aria-hidden', 'true');
    header.appendChild(indicator);
  }

  indicator.style.width = `${activeTab.offsetWidth}px`;
  indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
}

function syncAllTabIndicators() {
  document
    .querySelectorAll<HTMLElement>('.section__tab-container:not(.immersive) .section__tab-header')
    .forEach(syncTabIndicator);
}

async function replaceMainRow(url: string, push = true) {
  mainRowAbortController?.abort();
  mainRowAbortController = new AbortController();
  const response = await fetch(url, {
    credentials: 'same-origin',
    signal: mainRowAbortController.signal,
  });
  if (!response.ok) throw new Error(`Failed to load ${url}`);

  const html = await response.text();
  const documentNext = new DOMParser().parseFromString(html, 'text/html');
  const nextRow = documentNext.querySelector<HTMLElement>('.main > .row');
  const currentRow = document.querySelector<HTMLElement>('.main > .row');
  if (!nextRow || !currentRow) {
    window.location.href = url;
    return;
  }

  nextRow.querySelectorAll('.section').forEach((section) => section.classList.add('visible'));
  $(currentRow).trigger('vjContentRemove');
  currentRow.replaceWith(nextRow);
  document.title = documentNext.title || document.title;
  if (push) window.history.pushState({ contestSettingsMainRow: true }, document.title, url);
  $(nextRow).trigger('vjContentNew');
  $(nextRow).find('.section').trigger('vjLayout');
  syncAllTabIndicators();
}

function installModernTabs() {
  syncAllTabIndicators();
  document.addEventListener('click', async (ev) => {
    const tab = (ev.target as Element | null)?.closest?.('.section__tab-header-item') as HTMLElement | null;
    if (!tab) return;
    if (tab.matches('a[href]') && tab.dataset.lang && document.querySelector('[data-fragment-id="problem-description"]')) {
      const mouseEvent = ev as MouseEvent;
      if (mouseEvent.shiftKey || mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.altKey) return;
      ev.preventDefault();
      tab.parentElement
        ?.querySelectorAll('.section__tab-header-item')
        .forEach((item) => item.classList.remove('selected', 'tab--active'));
      tab.classList.add('tab--active');
      syncAllTabIndicators();
      try {
        await replaceMainRow((tab as HTMLAnchorElement).href);
      } catch (e) {
        if ((e as any).name === 'AbortError') return;
        Notification.error((e as Error).message);
        console.error(e);
      }
      return;
    }
    if (!tab.hasAttribute('data-tab-index')) return;
    window.setTimeout(syncAllTabIndicators, 0);
  });
  window.addEventListener('hashchange', () => window.setTimeout(syncAllTabIndicators, 0));
  window.addEventListener('popstate', (ev) => {
    if (!ev.state?.contestSettingsMainRow) return;
    replaceMainRow(window.location.href, false).catch((e) => console.error(e));
  });
  window.addEventListener('resize', syncAllTabIndicators);
  document.addEventListener('vjPageFullyInitialized', syncAllTabIndicators);
}

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

addPage(installModernShell);
addPage(new AutoloadPage('contest-settings-modern-tabs', installModernTabs));

addPage(new NamedPage(PROBLEM_PAGES, () => {
  autoEnterScratchpad();
  setupPasteRestriction();
}));
