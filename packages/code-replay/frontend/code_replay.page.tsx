import {
  $, NamedPage, addPage, ctx, i18n, loadMonaco, request, secureRandomString,
} from '@hydrooj/ui-default';
import type * as monacoTypes from 'monaco-editor';

/** Compact change: offset, length, text only */
interface CompactChange {
  o: number; // rangeOffset
  l: number; // rangeLength
  t: string; // replacement text
}

interface ReplayEvent {
  t: number;             // relative timestamp (ms)
  sq: number;            // sequence number
  changes: CompactChange[];
  paste?: { len: number; lines: number; };
  burst?: { count: number; duration: number; };
}

interface ReplaySnapshot {
  t: number;
  sq: number;
  code: string;
  lang?: string;
}

const CAPTURE_PAGES = ['problem_detail', 'contest_detail_problem', 'homework_detail_problem'];
const FLUSH_INTERVAL = 5000;
const SNAPSHOT_INTERVAL = 60000;
const MAX_BATCH_EVENTS = 500;
const MAX_PENDING_EVENTS = 3000;
const BURST_INTERVAL_THRESHOLD = 80;  // ms between keystrokes to count as burst
const BURST_MIN_COUNT = 5;            // minimum burst count to report
const BURST_RESET_INTERVAL = 500;     // ms of inactivity to reset burst counter
const PASTE_LENGTH_THRESHOLD = 20;    // min chars to detect paste

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

function getSeqKey() {
  return `${getSessionStorageKey()}/seq`;
}

function getSessionId() {
  const key = getSessionStorageKey();
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = secureRandomString(32);
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

function getLastSeq(): number {
  const v = sessionStorage.getItem(getSeqKey());
  return v ? parseInt(v, 10) || 0 : 0;
}

function saveLastSeq(seq: number) {
  sessionStorage.setItem(getSeqKey(), String(seq));
}

function getSubmitUrl() {
  return UiContext.postSubmitUrl;
}

function applyChanges(code: string, event: ReplayEvent) {
  const changes = [...event.changes].sort((a, b) => b.o - a.o);
  let next = code;
  for (const change of changes) {
    next = next.slice(0, change.o) + change.t + next.slice(change.o + change.l);
  }
  return next;
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
  seq: number;

  // Burst detection state
  private lastEditAt = 0;
  private burstCount = 0;
  private burstStartAt = 0;

  constructor(public editor: monacoTypes.editor.IStandaloneCodeEditor) {
    this.seq = getLastSeq();
    this.initialCode = editor.getValue({ lineEnding: '\n', preserveBOM: false });
    this.finalCode = this.initialCode;
    this.pendingSnapshots.push({
      t: 0,
      sq: this.nextSeq(),
      code: this.initialCode,
      lang: this.lang,
    });
  }

  private nextSeq(): number {
    this.seq++;
    return this.seq;
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
      this.finalCode = this.editor.getValue({ lineEnding: '\n', preserveBOM: false });
      const now = Date.now();
      const relativeTime = now - this.startedAt;

      // Build compact changes
      const changes: CompactChange[] = event.changes.map((change) => ({
        o: change.rangeOffset,
        l: change.rangeLength,
        t: change.text,
      }));

      // Detect paste: single change with large text or multiple newlines
      let pasteEvent: { len: number; lines: number; } | undefined;
      if (event.changes.length === 1) {
        const text = event.changes[0].text;
        const newlineCount = (text.match(/\n/g) || []).length;
        if (text.length >= PASTE_LENGTH_THRESHOLD || newlineCount >= 2) {
          pasteEvent = { len: text.length, lines: newlineCount + 1 };
        }
      }

      // Burst detection
      let burstEvent: { count: number; duration: number; } | undefined;
      const timeSinceLastEdit = now - this.lastEditAt;
      if (timeSinceLastEdit < BURST_INTERVAL_THRESHOLD && this.lastEditAt > 0) {
        // Continue burst
        if (this.burstCount === 0) this.burstStartAt = this.lastEditAt;
        this.burstCount++;
      } else if (timeSinceLastEdit > BURST_RESET_INTERVAL && this.burstCount >= BURST_MIN_COUNT) {
        // Burst ended — emit event for the completed burst
        burstEvent = { count: this.burstCount, duration: now - this.burstStartAt };
        this.burstCount = 0;
      } else if (timeSinceLastEdit > BURST_RESET_INTERVAL) {
        this.burstCount = 0;
      }
      this.lastEditAt = now;

      // If burst threshold just reached, emit burst event
      if (this.burstCount === BURST_MIN_COUNT && !burstEvent) {
        burstEvent = { count: this.burstCount, duration: now - this.burstStartAt };
      }

      this.pendingEvents.push({
        t: relativeTime,
        sq: this.nextSeq(),
        changes,
        ...(pasteEvent ? { paste: pasteEvent } : {}),
        ...(burstEvent ? { burst: burstEvent } : {}),
      });

      // Periodic snapshot
      if (now - this.lastSnapshotAt > SNAPSHOT_INTERVAL) {
        this.lastSnapshotAt = now;
        this.pendingSnapshots.push({
          t: relativeTime,
          sq: this.nextSeq(),
          code: this.finalCode,
          lang: this.lang,
        });
      }

      if (this.pendingEvents.length >= MAX_BATCH_EVENTS) this.flush();
      else this.scheduleFlush();
    });

    this._beforeUnloadHandler = () => this.flushBeacon();
    window.addEventListener('beforeunload', this._beforeUnloadHandler);

    // Flush on tab switch / visibility change
    this._visibilityHandler = () => {
      if (document.visibilityState === 'hidden') this.flushBeacon();
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    installSubmitPatch(this);
  }

  private _beforeUnloadHandler: (() => void) | null = null;
  private _visibilityHandler: (() => void) | null = null;

  dispose() {
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
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
    sessionStorage.removeItem(getSeqKey());
    this.sessionId = getSessionId();
    this.seq = 0;
    this.initialCode = this.finalCode;
    this.startedAt = Date.now();
    this.pendingEvents = [];
    this.pendingSnapshots = [{
      t: 0,
      sq: this.nextSeq(),
      code: this.initialCode,
      lang: this.lang,
    }];
    this.lastSnapshotAt = 0;
    this.burstCount = 0;
    this.lastEditAt = 0;
  }

  syncFromSubmitPayload(payload: Record<string, any>) {
    if (typeof payload?.lang === 'string') this.lang = payload.lang;
    else this.lang = getLangFromStore();
    if (typeof payload?.code === 'string') this.finalCode = payload.code;
    else this.finalCode = this.editor.getValue({ lineEnding: '\n', preserveBOM: false });
  }

  addSnapshot() {
    this.pendingSnapshots.push({
      t: Date.now() - this.startedAt,
      sq: this.nextSeq(),
      code: this.finalCode,
      lang: this.lang,
    });
  }

  scheduleFlush() {
    if (this.flushTimer || this.flushing) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_INTERVAL);
  }

  async flush() {
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const events = this.pendingEvents.splice(0);
    const snapshots = this.pendingSnapshots.splice(0);
    if (!events.length && !snapshots.length) return true;
    this.flushing = true;
    try {
      await request.post(getSessionUrl(), this.payload(events, snapshots));
      this.flushing = false;
      saveLastSeq(this.seq);
      return true;
    } catch (e) {
      this.flushing = false;
      const totalPending = this.pendingEvents.length + events.length;
      if (totalPending > MAX_PENDING_EVENTS) {
        const keep = Math.floor(MAX_PENDING_EVENTS / 2);
        this.pendingEvents = this.pendingEvents.slice(-keep);
        this.pendingSnapshots = this.pendingSnapshots.slice(-Math.floor(this.pendingSnapshots.length / 2));
        this.pendingEvents.unshift(...events.slice(-keep));
      } else {
        this.pendingEvents.unshift(...events);
        this.pendingSnapshots.unshift(...snapshots);
      }
      console.warn(e);
      return false;
    }
  }

  flushBeacon() {
    if (this.flushing) return;
    const events = this.pendingEvents.splice(0);
    const snapshots = this.pendingSnapshots.splice(0);
    if (!events.length && !snapshots.length) return;
    saveLastSeq(this.seq);
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
    if (isReplaySubmit && currentCapture) {
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
  const snapshots: ReplaySnapshot[] = [...replay.snapshots || []].sort((a, b) => a.t - b.t);

  // Reconstruct code states from event stream
  const states = [replay.initialCode || ''];
  let currentCode = states[0];
  let snapshotIndex = 0;
  for (const event of events) {
    // Advance snapshot index
    while (snapshotIndex < snapshots.length && snapshots[snapshotIndex].t <= event.t) {
      currentCode = snapshots[snapshotIndex].code;
      snapshotIndex++;
    }
    // Apply changes (supports both old rangeOffset/rangeLength and new o/l/t formats)
    const normalizedEvent = {
      ...event,
      changes: event.changes.map((c: any) => ({
        o: c.o ?? c.rangeOffset ?? 0,
        l: c.l ?? c.rangeLength ?? 0,
        t: c.t ?? c.text ?? '',
      })),
    };
    currentCode = applyChanges(currentCode, normalizedEvent);
    states.push(currentCode);
  }
  if (typeof replay.finalCode === 'string' && replay.finalCode !== states[states.length - 1]) {
    states.push(replay.finalCode);
  }

  const maxIndex = Math.max(0, states.length - 1);
  const duration = events.length ? events[events.length - 1].t : 0;
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
    return events[i - 1]?.t || duration;
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
