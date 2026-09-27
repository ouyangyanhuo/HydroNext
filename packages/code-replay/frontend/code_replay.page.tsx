import {
  $, addPage, ctx, i18n, loadMonaco, NamedPage, request, secureRandomString,
} from '@hydrooj/ui-default';
import type * as monacoTypes from 'monaco-editor';
import { buildReplayStates, captureReplayChanges, replayBatches } from '../replay';

interface ReplayEvent {
  seq?: number;
  t: number;
  changes: {
    rangeOffset: number;
    rangeLength: number;
    text: string;
    range?: unknown;
  }[];
  selections?: unknown[];
  lang?: string;
}

interface ReplaySnapshot {
  afterSeq?: number;
  t: number;
  code: string;
  lang?: string;
}

const CAPTURE_PAGES = ['problem_detail', 'contest_detail_problem', 'homework_detail_problem'];
const FLUSH_INTERVAL = 2500;
const SNAPSHOT_INTERVAL = 30000;
const MAX_BATCH_EVENTS = 200;

function getSessionUrl() {
  return UiContext.codeReplaySessionUrl || '/code-replay/session';
}

function getPageName() {
  return document.documentElement.getAttribute('data-page') || '';
}

function getLangFromStore() {
  return (window as any).store?.getState?.()?.editor?.lang || UiContext.codeLang || '';
}

function getSessionStorageKey() {
  const tdoc = UiContext.tdoc?._id ? `@${UiContext.tdoc._id}` : '';
  return `code-replay/${UserContext._id}/${UiContext.pdoc?.domainId}/${UiContext.pdoc?.docId}${tdoc}`;
}

function getSessionId() {
  const key = getSessionStorageKey();
  const sessionId = secureRandomString(32);
  sessionStorage.setItem(key, sessionId);
  return sessionId;
}

function getSubmitUrl() {
  return UiContext.postSubmitUrl;
}

function serializeSelections(editor: monacoTypes.editor.IStandaloneCodeEditor) {
  return editor.getSelections()?.map((selection) => ({
    startLineNumber: selection.startLineNumber,
    startColumn: selection.startColumn,
    endLineNumber: selection.endLineNumber,
    endColumn: selection.endColumn,
  }));
}

class ScratchpadReplayCapture {
  sessionId = getSessionId();
  initialCode = '';
  finalCode = '';
  lang = getLangFromStore();
  startedAt = Date.now();
  pendingEvents: ReplayEvent[] = [];
  pendingSnapshots: ReplaySnapshot[] = [];
  flushTimer: ReturnType<typeof setTimeout> | null = null;
  lastSnapshotAt = 0;
  installed = false;
  flushing = false;
  sequence = 0;
  flushPromise: Promise<boolean> = Promise.resolve(true);

  constructor(public editor: monacoTypes.editor.IStandaloneCodeEditor) {
    this.initialCode = editor.getValue();
    this.finalCode = this.initialCode;
    this.pendingSnapshots.push({
      t: 0,
      afterSeq: 0,
      code: this.initialCode,
      lang: this.lang,
    });
  }

  install() {
    if (this.installed) return;
    this.installed = true;
    this.editor.onDidDispose?.(() => {
      void this.flush();
      if (currentCapture === this) currentCapture = null;
    });
    this.editor.onDidChangeModelContent((event) => {
      this.lang = getLangFromStore();
      const previousValue = this.finalCode;
      this.finalCode = this.editor.getValue();
      const changes = captureReplayChanges(previousValue, this.finalCode, event.changes);
      if (!changes.length) return;
      this.pendingEvents.push({
        seq: ++this.sequence,
        t: Date.now() - this.startedAt,
        lang: this.lang,
        selections: serializeSelections(this.editor),
        changes,
      });
      if (Date.now() - this.lastSnapshotAt > SNAPSHOT_INTERVAL) {
        this.lastSnapshotAt = Date.now();
        this.pendingSnapshots.push({
          t: Date.now() - this.startedAt,
          code: this.finalCode,
          afterSeq: this.sequence,
          lang: this.lang,
        });
      }
      if (this.pendingEvents.length >= MAX_BATCH_EVENTS) this.flush();
      else this.scheduleFlush();
    });
    this._beforeUnloadHandler = () => this.flushBeacon();
    window.addEventListener('beforeunload', this._beforeUnloadHandler);
    installSubmitPatch(this);
  }

  private _beforeUnloadHandler: (() => void) | null = null;

  dispose() {
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (currentCapture === this) currentCapture = null;
  }

  payload(events: ReplayEvent[], snapshots: ReplaySnapshot[]) {
    return {
      sessionId: this.sessionId,
      pid: UiContext.pdoc?.docId,
      tid: UiContext.tdoc?._id,
      lang: this.lang,
      initialCode: this.initialCode,
      finalCode: this.finalCode,
      events,
      snapshots,
    };
  }

  resetSession() {
    sessionStorage.removeItem(getSessionStorageKey());
    this.sessionId = getSessionId();
    this.initialCode = this.finalCode;
    this.startedAt = Date.now();
    this.pendingEvents = [];
    this.sequence = 0;
    this.pendingSnapshots = [{
      t: 0,
      afterSeq: 0,
      code: this.initialCode,
      lang: this.lang,
    }];
    this.lastSnapshotAt = 0;
  }

  syncFromSubmitPayload(payload: Record<string, any>) {
    if (typeof payload?.lang === 'string') this.lang = payload.lang;
    else this.lang = getLangFromStore();
    if (typeof payload?.code === 'string') this.finalCode = payload.code;
    else this.finalCode = this.editor.getValue();
  }

  addSnapshot() {
    this.pendingSnapshots.push({
      t: Date.now() - this.startedAt,
      code: this.finalCode,
      afterSeq: this.sequence,
      lang: this.lang,
    });
  }

  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_INTERVAL);
  }

  flush() {
    this.flushPromise = this.flushPromise.then(() => this.flushPending());
    return this.flushPromise;
  }

  async flushPending() {
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const events = this.pendingEvents.splice(0);
    const snapshots = this.pendingSnapshots.splice(0);
    if (!events.length && !snapshots.length) return true;
    this.flushing = true;
    try {
      const payload = this.payload(events, snapshots);
      for (const batch of replayBatches(events, snapshots)) {
        await request.post(getSessionUrl(), {
          ...payload,
          ...batch,
        });
      }
      this.flushing = false;
      return true;
    } catch (e) {
      this.flushing = false;
      this.pendingEvents.unshift(...events);
      this.pendingSnapshots.unshift(...snapshots);
      // Replay capture must not block normal editing or submission.
      console.warn(e);
      return false;
    }
  }

  flushBeacon() {
    // Skip if flush() is in-flight — data is already being sent
    if (this.flushing) return;
    const events = this.pendingEvents.splice(0);
    const snapshots = this.pendingSnapshots.splice(0);
    if (!events.length && !snapshots.length) return;
    const body = JSON.stringify(this.payload(events, snapshots));
    navigator.sendBeacon?.(getSessionUrl(), new Blob([body], { type: 'application/json' }));
  }
}

let currentCapture: ScratchpadReplayCapture | null = null;
let submitPatchInstalled = false;
let originalPost: typeof request.post | null = null;
let scratchpadWatchTimer: ReturnType<typeof setInterval> | null = null;
const capturedEditors = new WeakSet<monacoTypes.editor.IStandaloneCodeEditor>();

function installSubmitPatch(capture: ScratchpadReplayCapture) {
  currentCapture = capture;
  if (submitPatchInstalled) return;
  submitPatchInstalled = true;
  originalPost = request.post.bind(request);
  request.post = async (url: string, dataOrForm: any = {}, options: any = {}) => {
    const isReplaySubmit = (
      currentCapture
      && CAPTURE_PAGES.includes(getPageName())
      && url === getSubmitUrl()
      && dataOrForm
      && typeof dataOrForm === 'object'
      && !dataOrForm.pretest
    );
    if (
      isReplaySubmit
      && currentCapture
    ) {
      currentCapture.syncFromSubmitPayload(dataOrForm);
      currentCapture.addSnapshot();
      const flushed = await currentCapture.flush();
      const sessionId = currentCapture.sessionId;
      dataOrForm = {
        ...dataOrForm,
        codeReplaySessionId: sessionId,
      };
      const result = await originalPost!(url, dataOrForm, options);
      if (result?.rid) {
        if (!flushed) {
          console.warn('Code replay was bound with fallback data because event upload failed before submit.');
        }
        currentCapture.resetSession();
      }
      return result;
    }
    return originalPost!(url, dataOrForm, options);
  };
}

function uninstallSubmitPatch() {
  if (!submitPatchInstalled || !originalPost) return;
  request.post = originalPost;
  submitPatchInstalled = false;
  originalPost = null;
  currentCapture = null;
}

function installScratchpadCapture() {
  if (!CAPTURE_PAGES.includes(getPageName())) return;
  if (!UiContext.pdoc || !UserContext._id) return;
  if (scratchpadWatchTimer) window.clearInterval(scratchpadWatchTimer);
  scratchpadWatchTimer = window.setInterval(() => {
    if (!CAPTURE_PAGES.includes(getPageName())) {
      if (scratchpadWatchTimer) window.clearInterval(scratchpadWatchTimer);
      scratchpadWatchTimer = null;
      currentCapture = null;
      return;
    }
    const scratchpad = (ctx as any).scratchpad;
    const editor = scratchpad?.editor;
    if (!editor || capturedEditors.has(editor)) return;
    capturedEditors.add(editor);
    const capture = new ScratchpadReplayCapture(editor);
    capture.install();
  }, 500);
  window.addEventListener('beforeunload', () => {
    if (scratchpadWatchTimer) window.clearInterval(scratchpadWatchTimer);
  });
}

function installRecordDetailEntry() {
  if (getPageName() !== 'record_detail' || !UiContext.codeReplayUrl) return;
  const $codeTools = $('.section__header:has(.section__title)').filter((_, element) => (
    $(element).find('.section__title').text().trim() === i18n('Code')
  )).find('.section__tools').first();
  const $link = $(`
    <a class="primary rounded button" href="${UiContext.codeReplayUrl}">
      <span class="icon icon-play"></span>
      ${i18n('Code Replay')}
    </a>
  `);
  if ($codeTools.length) $codeTools.prepend($link);
}

function formatTime(ms: number) {
  const sec = Math.floor(ms / 1000);
  const minute = Math.floor(sec / 60);
  return `${minute}:${String(sec % 60).padStart(2, '0')}`;
}

async function installReplayPlayer() {
  if (getPageName() !== 'code_replay') return;
  const container = document.getElementById('code-replay-player');
  if (!container) return;

  let data: any;
  try {
    data = await request.get(UiContext.codeReplayDataUrl || `${window.location.pathname}/data`);
  } catch (e) {
    container.innerHTML = `<blockquote class="note">${i18n('No replay data is available.')}</blockquote>`;
    console.warn('Failed to load replay data:', e);
    return;
  }

  const replay = data.replay;
  const events: ReplayEvent[] = replay.events || [];
  const { states, times } = buildReplayStates(events, replay.snapshots || [], replay.initialCode || '', replay.finalCode);

  const maxIndex = Math.max(0, states.length - 1);
  const duration = times[times.length - 1];
  container.innerHTML = `
    <div class="row">
      <div class="medium-12 columns">
        <p>
          <button type="button" class="rounded button" data-replay-restart>${i18n('Restart')}</button>
          <button type="button" class="primary rounded button" data-replay-play>${i18n('Play')}</button>
          <button type="button" class="rounded button" data-replay-prev>${i18n('Previous Step')}</button>
          <button type="button" class="rounded button" data-replay-next>${i18n('Next Step')}</button>
          <label style="display:inline-block;margin-left:1rem;">
            ${i18n('Speed')}
            <select class="select" data-replay-speed>
              <option value="0.5">0.5x</option>
              <option value="1" selected>1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
            </select>
          </label>
        </p>
        <p>
          <input type="range" min="0" max="${maxIndex}" value="0" data-replay-range style="width:100%;">
        </p>
        <p class="typo">
          ${i18n('Events')}: <span data-replay-index>0</span> / ${maxIndex}
          &nbsp; ${i18n('Duration')}: <span data-replay-time>0:00</span> / ${formatTime(duration)}
        </p>
        <div data-replay-editor style="height: 65vh; min-height: 420px; border: 1px solid var(--border-color, #ddd);"></div>
      </div>
    </div>
  `;

  const langKey = replay.lang || data.rdoc?.lang;
  const language = (window.LANGS && langKey && window.LANGS[langKey]?.monaco) || 'plaintext';
  const { monaco } = await loadMonaco([language]);
  const model = monaco.editor.createModel(states[0], language);
  const editor = monaco.editor.create(container.querySelector('[data-replay-editor]') as HTMLElement, {
    model,
    readOnly: true,
    minimap: { enabled: false },
    lineNumbers: 'on',
    automaticLayout: true,
    fontFamily: UserContext.codeFontFamily,
  });
  let index = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const range = container.querySelector('[data-replay-range]') as HTMLInputElement;
  const indexText = container.querySelector('[data-replay-index]') as HTMLElement;
  const timeText = container.querySelector('[data-replay-time]') as HTMLElement;
  const playButton = container.querySelector('[data-replay-play]') as HTMLButtonElement;
  const speed = container.querySelector('[data-replay-speed]') as HTMLSelectElement;

  function eventTime(i: number) {
    if (i <= 0) return 0;
    return times[i] || 0;
  }

  function render(target: number) {
    index = Math.max(0, Math.min(maxIndex, target));
    model.setValue(states[index] || '');
    range.value = String(index);
    indexText.textContent = String(index);
    timeText.textContent = formatTime(eventTime(index));
  }

  function stop() {
    if (timer) window.clearTimeout(timer);
    timer = null;
    playButton.textContent = i18n('Play');
  }

  function play() {
    if (timer) {
      stop();
      return;
    }
    playButton.textContent = i18n('Pause');
    const tick = () => {
      if (index >= maxIndex) {
        stop();
        return;
      }
      const currentTime = eventTime(index);
      render(index + 1);
      const nextTime = eventTime(index);
      const delay = Math.max(20, (nextTime - currentTime) / Number(speed.value || 1));
      timer = window.setTimeout(tick, delay);
    };
    tick();
  }

  range.addEventListener('input', () => {
    stop();
    render(Number(range.value));
  });
  container.querySelector('[data-replay-restart]')?.addEventListener('click', () => {
    stop();
    render(0);
  });
  container.querySelector('[data-replay-prev]')?.addEventListener('click', () => {
    stop();
    render(index - 1);
  });
  container.querySelector('[data-replay-next]')?.addEventListener('click', () => {
    stop();
    render(index + 1);
  });
  playButton.addEventListener('click', play);

  if (!events.length) {
    container.prepend($(`<blockquote class="note">${i18n('No replay data is available.')}</blockquote>`).get(0));
  }
  window.addEventListener('beforeunload', () => {
    stop();
    editor.dispose();
    model.dispose();
  });
}

addPage(new NamedPage(CAPTURE_PAGES, installScratchpadCapture));
addPage(new NamedPage('record_detail', installRecordDetailEntry));
addPage(new NamedPage('code_replay', installReplayPlayer));
