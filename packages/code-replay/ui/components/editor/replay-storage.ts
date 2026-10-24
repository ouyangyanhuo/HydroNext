import { newRecording, type ReplayRecording } from './replay-recording';

let database: Promise<IDBDatabase> | undefined;
const activeRecordings = new Map<string, ReplayRecording>();
const persisted = new WeakMap<ReplayRecording, number>();
const draftKeys = new Map<string, string>();
const previousDraftKeys = new Map<string, string>();

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

export async function restoreRecording(key: string, initialCode: string) {
  if (activeRecordings.has(key)) return activeRecordings.get(key)!;
  const db = await openDatabase();
  const transaction = db.transaction(['drafts', 'events'], 'readonly');
  const result = new Promise<ReplayRecording | undefined>((resolve, reject) => {
    const request = transaction.objectStore('drafts').get(previousDraftKeys.get(key) || key);
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
        const recording = { ...saved, events: events.result.map(({ sessionId: _sessionId, ...event }) => event) } as ReplayRecording;
        if (previousDraftKeys.has(key)) {
          recording.sessionId = newRecording('').sessionId;
        } else persisted.set(recording, saved.sequence);
        resolve(recording);
      };
    };
  });
  const [restored] = await Promise.all([result, completed(transaction)]);
  // A concurrent StrictMode restoration must not replace an already active recorder.
  if (!activeRecordings.has(key)) activeRecordings.set(key, restored || newRecording(initialCode));
  return activeRecordings.get(key)!;
}

/** Save only new deltas, atomically with the corresponding metadata/code checkpoint. */
export async function persistRecording(key: string, recording: ReplayRecording) {
  const { events, ...metadata } = recording;
  const pending = events.slice(persisted.get(recording) || 0);
  const db = await openDatabase();
  const transaction = db.transaction(['drafts', 'events'], 'readwrite');
  const store = transaction.objectStore('events');
  for (const event of pending) store.put({ ...event, sessionId: recording.sessionId });
  transaction.objectStore('drafts').put(metadata, key);
  await completed(transaction);
  persisted.set(recording, Math.max(persisted.get(recording) || 0, metadata.sequence));
  for (const [context, currentKey] of draftKeys) {
    if (currentKey !== key) continue;
    try { sessionStorage.setItem(`hydro-replay-draft:${context}`, key); } catch { /* Keep the in-memory draft usable. */ }
    break;
  }
}

export function replaceRecording(key: string, recording: ReplayRecording) {
  activeRecordings.set(key, recording);
  return persistRecording(key, recording);
}
