import { newRecording, type ReplayRecording } from './replay-recording';

let database: Promise<IDBDatabase> | undefined;
const activeRecordings = new Map<string, ReplayRecording>();
const persisted = new WeakMap<ReplayRecording, number>();
const draftKeys = new Map<string, string>();
const previousDraftKeys = new Map<string, string>();
const storageTargets = new Map<string, string>();
const restorations = new Map<string, Promise<ReplayRecording>>();
const ownership = new Map<string, Promise<boolean>>();
const owned = new Set<string>();

/** Hold ownership for this document's lifetime. Never steal a live tab's draft. */
function ownDraft(key: string): Promise<boolean> {
  if (ownership.has(key)) return ownership.get(key)!;
  const result = new Promise<boolean>((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.locks) {
      resolve(false);
      return;
    }
    void Promise.resolve().then(() => navigator.locks.request(`hydro-replay-writer:${key}`, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        resolve(false);
        return;
      }
      owned.add(key);
      resolve(true);
      // The browser releases the lock when the document is destroyed, including crashes.
      await new Promise<void>(() => {});
    })).catch(() => resolve(false));
  });
  ownership.set(key, result);
  return result;
}

function openDatabase() {
  database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('hydro-code-replay', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts');
      request.result.createObjectStore('events', { keyPath: ['sessionId', 'seq'] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Replay storage is blocked'));
  });
  return database;
}

function completed(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Replay storage aborted'));
  });
}

export function replayDraftKey(context: string) {
  if (draftKeys.has(context)) return draftKeys.get(context)!;
  // A document gets its own key even when a browser duplicates sessionStorage.
  // The previous key is read-only recovery input; restored event streams are forked too.
  const key = `${context}/${newRecording('').sessionId}`;
  try {
    const storageKey = `hydro-replay-draft:${context}`;
    const legacyTab = sessionStorage.getItem('hydro-replay-tab');
    const previous = sessionStorage.getItem(storageKey) || (legacyTab ? `${context}/${legacyTab}` : '');
    if (previous) previousDraftKeys.set(key, previous);
    // Published after persistence, so refreshing during initialization cannot lose the prior draft.
  } catch { /* IndexedDB may remain usable when sessionStorage is disabled. */ }
  draftKeys.set(context, key);
  return key;
}

export function memoryRecording(key: string, initialCode: string) {
  if (!activeRecordings.has(key)) activeRecordings.set(key, newRecording(initialCode));
  return activeRecordings.get(key)!;
}

async function restore(key: string, initialCode: string) {
  if (activeRecordings.has(key)) return activeRecordings.get(key)!;
  const db = await openDatabase();
  const sourceKey = previousDraftKeys.get(key) || key;
  let reuse = false;
  if (previousDraftKeys.has(key)) {
    const check = db.transaction(['drafts'], 'readonly');
    const metadata = new Promise<any>((resolve, reject) => {
      const request = check.objectStore('drafts').get(sourceKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [saved] = await Promise.all([metadata, completed(check)]);
    // Unmarked legacy drafts may still belong to a tab running the old code.
    reuse = saved?.writerVersion === 1 && await ownDraft(sourceKey);
  }
  if (!reuse) await ownDraft(key);
  const transaction = db.transaction(['drafts', 'events'], 'readonly');
  const result = new Promise<ReplayRecording | undefined>((resolve, reject) => {
    // Re-read after acquiring ownership; an outgoing writer may have just committed.
    const request = transaction.objectStore('drafts').get(sourceKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const saved = request.result;
      if (!saved || saved.version !== 2) {
        resolve(undefined);
        return;
      }
      const events = transaction.objectStore('events').getAll(IDBKeyRange.bound([saved.sessionId, 0], [saved.sessionId, saved.sequence]));
      events.onerror = () => reject(events.error);
      events.onsuccess = () => {
        if (events.result.length !== saved.sequence) {
          reject(new Error('Incomplete local replay'));
          return;
        }
        const { writerVersion: _writerVersion, ...metadata } = saved;
        const recording = { ...metadata, events: events.result.map(({ sessionId: _sessionId, ...event }) => event) } as ReplayRecording;
        if (previousDraftKeys.has(key) && !reuse) {
          recording.sessionId = newRecording('').sessionId;
        } else persisted.set(recording, saved.sequence);
        resolve(recording);
      };
    };
  });
  const [restored] = await Promise.all([result, completed(transaction)]);
  if (reuse) storageTargets.set(key, sourceKey);
  // A concurrent StrictMode restoration must not replace an already active recorder.
  if (!activeRecordings.has(key)) activeRecordings.set(key, restored || newRecording(initialCode));
  return activeRecordings.get(key)!;
}

export function restoreRecording(key: string, initialCode: string) {
  if (activeRecordings.has(key)) return Promise.resolve(activeRecordings.get(key)!);
  if (!restorations.has(key)) {
    restorations.set(key, restore(key, initialCode).catch((error) => {
      restorations.delete(key);
      throw error;
    }));
  }
  return restorations.get(key)!;
}

/** Save only new deltas, atomically with the corresponding metadata/code checkpoint. */
export async function persistRecording(key: string, recording: ReplayRecording) {
  const { events, ...metadata } = recording;
  const pending = events.slice(persisted.get(recording) || 0);
  const db = await openDatabase();
  const target = storageTargets.get(key) || key;
  const transaction = db.transaction(['drafts', 'events'], 'readwrite');
  const store = transaction.objectStore('events');
  for (const event of pending) store.put({ ...event, sessionId: recording.sessionId });
  transaction.objectStore('drafts').put({ ...metadata, ...(owned.has(target) ? { writerVersion: 1 } : {}) }, target);
  await completed(transaction);
  persisted.set(recording, Math.max(persisted.get(recording) || 0, metadata.sequence));
  for (const [context, currentKey] of draftKeys) {
    if (currentKey !== key) continue;
    try { sessionStorage.setItem(`hydro-replay-draft:${context}`, target); } catch { /* Keep the in-memory draft usable. */ }
    break;
  }
}

export function replaceRecording(key: string, recording: ReplayRecording) {
  activeRecordings.set(key, recording);
  return persistRecording(key, recording);
}
