import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const built = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/components/editor/replay-storage.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
});

// Small asynchronous IndexedDB contract double; no browser globals or user data are touched.
function databaseFixture() {
    const stores = new Map<string, Map<string, any>>();
    let failWrites = false;
    const db = {
        createObjectStore(name: string) { stores.set(name, new Map()); },
        transaction(_names: string[], mode: string) {
            const staged = new Map([...stores].map(([key, values]) => [key, new Map(values)]));
            let pending = 0;
            const tx: any = { error: null };
            function request(operation: () => any) {
                pending++;
                const result: any = {};
                setTimeout(() => {
                    try {
                        result.result = operation();
                        result.onsuccess?.();
                    } catch (error) {
                        result.error = error;
                        tx.error = error;
                        result.onerror?.();
                    }
                    pending--;
                    if (!pending) {
                        if (tx.error) tx.onabort?.();
                        else {
                            if (mode === 'readwrite') for (const [key, value] of staged) stores.set(key, value);
                            tx.oncomplete?.();
                        }
                    }
                }, 0);
                return result;
            }
            tx.objectStore = (name: string) => ({
                get: (key: string) => request(() => structuredClone(staged.get(name)!.get(JSON.stringify(key)))),
                getAll: (range: any) => request(() => [...staged.get(name)!.values()]
                    .filter((entry) => entry.sessionId === range.lower[0] && entry.seq >= range.lower[1] && entry.seq <= range.upper[1])
                    .sort((a, b) => a.seq - b.seq).map((entry) => structuredClone(entry))),
                put(value: any, key?: string) {
                    const copied = structuredClone(value);
                    return request(() => {
                        if (failWrites) throw new Error('Quota exceeded');
                        staged.get(name)!.set(JSON.stringify(key ?? [copied.sessionId, copied.seq]), copied);
                    });
                },
            });
            return tx;
        },
    };
    const indexedDB = {
        open() {
            const request: any = {};
            setTimeout(() => {
                request.result = db;
                if (!stores.size) request.onupgradeneeded?.();
                request.onsuccess?.();
            }, 0);
            return request;
        },
    };
    function runtime(session = new Map<string, string>()) {
        const module = { exports: {} as any };
        runInNewContext(built.outputFiles[0].text, {
            module, exports: module.exports, require, crypto, Date, indexedDB,
            sessionStorage: { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value) },
            IDBKeyRange: { bound: (lower: any, upper: any) => ({ lower, upper }) },
        });
        return module.exports;
    }
    return { runtime, stores, failWrites: () => { failWrites = true; } };
}

test('fresh runtime restores IndexedDB metadata and incremental events after refresh', async () => {
    const fixture = databaseFixture();
    const first = fixture.runtime();
    const recording = await first.restoreRecording('user/domain/problem/tab', '');
    recording.events.push({ seq: 1, t: 1, changes: [{ rangeOffset: 0, rangeLength: 0, text: 'a' }] });
    recording.sequence = 1;
    recording.currentCode = 'a';
    recording.lastTime = 1;
    await first.persistRecording('user/domain/problem/tab', recording);
    recording.events.push({ seq: 2, t: 2, changes: [{ rangeOffset: 1, rangeLength: 0, text: 'b' }] });
    recording.sequence = 2;
    recording.currentCode = 'ab';
    recording.lastTime = 2;
    await first.persistRecording('user/domain/problem/tab', recording);
    const second = fixture.runtime();
    const restored = await second.restoreRecording('user/domain/problem/tab', 'unrelated fallback');
    assert.equal(restored.sessionId, recording.sessionId);
    assert.equal(restored.sequence, 2);
    assert.equal(restored.currentCode, 'ab');
    assert.equal(restored.initialCode, '');
    assert.equal(restored.startedAt, recording.startedAt);
    assert.equal(fixture.stores.get('events')!.size, 2);
    assert.equal(restored.events[1].changes[0].text, 'b');
    const other = await second.restoreRecording('user/another-domain/problem/tab', '');
    assert.notEqual(other.sessionId, restored.sessionId);
});

test('duplicated tabs fork both draft keys and event streams; refresh ignores another tabs cached code', async () => {
    const fixture = databaseFixture();
    const context = 'user/domain/problem';
    const sessionA = new Map<string, string>();
    const first = fixture.runtime(sessionA);
    const key = first.replayDraftKey(context);
    const original = await first.restoreRecording(key, 'AAA');
    await first.persistRecording(key, original);
    const sessionB = new Map(sessionA); // Browser Duplicate Tab copies sessionStorage.
    const tabA = fixture.runtime(sessionA);
    const tabB = fixture.runtime(sessionB);
    const keyA = tabA.replayDraftKey(context);
    const keyB = tabB.replayDraftKey(context);
    assert.notEqual(keyA, keyB);
    assert.equal(tabA.replayDraftKey(context), keyA);
    const a = await tabA.restoreRecording(keyA, 'wrong shared localStorage');
    const b = await tabB.restoreRecording(keyB, 'wrong shared localStorage');
    assert.notEqual(a.sessionId, b.sessionId);
    assert.equal(a.currentCode, 'AAA');
    b.events.push({ seq: 1, t: 1, changes: [{ rangeOffset: 0, rangeLength: 3, text: 'BBB' }] });
    b.currentCode = 'BBB';
    b.sequence = 1;
    b.lastTime = 1;
    await tabA.persistRecording(keyA, a);
    await tabB.persistRecording(keyB, b);
    const refreshA = fixture.runtime(sessionA);
    const restoredA = await refreshA.restoreRecording(refreshA.replayDraftKey(context), 'BBB');
    assert.equal(restoredA.currentCode, 'AAA');
    assert.equal(restoredA.sequence, 0);
    const refreshB = fixture.runtime(sessionB);
    const restoredB = await refreshB.restoreRecording(refreshB.replayDraftKey(context), 'AAA');
    assert.equal(restoredB.currentCode, 'BBB');
    assert.equal(restoredB.sequence, 1);
    assert.equal(restoredB.events[0].changes[0].text, 'BBB');
    // Forked events must be copied to the new stream before publishing its draft pointer.
    await refreshB.persistRecording(refreshB.replayDraftKey(context), restoredB);
    const again = fixture.runtime(sessionB);
    assert.equal((await again.restoreRecording(again.replayDraftKey(context), '')).events.length, 1);
});

test('initialization restores authoritative code before mounting the editor, without recording a fake edit', () => {
    const source = readFileSync(new URL('../src/components/editor/scratchpad.tsx', import.meta.url), 'utf8');
    const initialize = source.slice(source.indexOf('const initialize = async () =>'), source.indexOf('void initialize()'));
    assert.match(initialize, /setCode\(recording.currentCode\)/);
    assert.doesNotMatch(initialize, /recordCode\(/);
    assert.match(source, /replayReady \? <CodeEditor/);
});

test('refresh during initialization retains the prior persisted pointer and legacy drafts migrate', async () => {
    const fixture = databaseFixture();
    const context = 'user/domain/problem';
    const session = new Map([['hydro-replay-tab', 'legacy-tab']]);
    const seed = fixture.runtime(session);
    await seed.persistRecording(`${context}/legacy-tab`, seed.memoryRecording(`${context}/legacy-tab`, 'saved'));
    const first = fixture.runtime(session);
    await first.restoreRecording(first.replayDraftKey(context), 'wrong');
    // No persistence completed yet. Refresh must still read the legacy draft.
    const refreshed = fixture.runtime(session);
    const restored = await refreshed.restoreRecording(refreshed.replayDraftKey(context), 'wrong');
    assert.equal(restored.currentCode, 'saved');
});

test('storage failure rejects and does not discard the active in-memory recording', async () => {
    const fixture = databaseFixture();
    const runtime = fixture.runtime();
    const recording = await runtime.restoreRecording('draft', 'code');
    fixture.failWrites();
    await assert.rejects(runtime.persistRecording('draft', recording), /Quota/);
    assert.equal(runtime.memoryRecording('draft', 'fallback'), recording);
    assert.equal(recording.currentCode, 'code');
    assert.equal(fixture.stores.get('drafts')!.size, 0);
});

test('replacing a submitted segment persists the new baseline across remount and refresh', async () => {
    const fixture = databaseFixture();
    const runtime = fixture.runtime();
    const old = await runtime.restoreRecording('draft', '');
    await runtime.persistRecording('draft', old);
    const next = {
        ...old, sessionId: 'next-segment', initialCode: 'abc', currentCode: 'abcd',
        startedAt: 1000, sequence: 1, lastTime: 100,
        events: [{ seq: 1, t: 100, changes: [{ rangeOffset: 3, rangeLength: 0, text: 'd' }] }],
    };
    await runtime.replaceRecording('draft', next);
    assert.equal(await runtime.restoreRecording('draft', 'fallback'), next);
    const restored = await fixture.runtime().restoreRecording('draft', 'fallback');
    assert.equal(restored.sessionId, 'next-segment');
    assert.equal(restored.initialCode, 'abc');
    assert.equal(restored.currentCode, 'abcd');
    assert.equal(restored.sequence, 1);
    assert.equal(restored.events[0].changes[0].rangeOffset, 3);
});
