import assert from 'node:assert/strict';
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
    function runtime() {
        const module = { exports: {} as any };
        runInNewContext(built.outputFiles[0].text, {
            module, exports: module.exports, require, crypto, Date, indexedDB,
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
