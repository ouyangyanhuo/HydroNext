import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
function loadModule(path: string) {
    const built = buildSync({
        entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs',
    });
    const module = { exports: {} as any };
    runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require, crypto, Date });
    return module.exports;
}
const { newRecording, recordCode, recordingCheckpoint, uploadRecordingCheckpoint } = loadModule('../src/components/editor/replay-recording.ts');
const { continuousPrefix } = loadModule('../../code-replay/continuous.ts');
const { buildReplayStates } = loadModule('../../code-replay/replay.ts');
const plain = (value: any) => JSON.parse(JSON.stringify(value));

test('self-tests do not create checkpoints or reset recordings; later submissions retain the full prefix', () => {
    const recording = newRecording('', 1000);
    recordCode(recording, 'abc', 'cc', undefined, 1100);
    // Self-test neither calls the uploader nor changes the recording session.
    const sessionId = recording.sessionId;
    recordCode(recording, 'adc', 'cc', undefined, 1200);
    const first = recordingCheckpoint(recording, 1300);
    recordCode(recording, 'ad', 'cc', undefined, 1400);
    const second = recordingCheckpoint(recording, 1500);
    assert.equal(recording.sessionId, sessionId);
    assert.equal(first.endSeq, 2);
    assert.equal(second.endSeq, 3);
    assert.deepEqual(plain(buildReplayStates(first.events, [], first.initialCode, first.finalCode).states), ['', 'abc', 'adc']);
    assert.deepEqual(plain(buildReplayStates(second.events, [], second.initialCode, second.finalCode).states), ['', 'abc', 'adc', 'ad']);
    assert.equal(continuousPrefix(second.events, first.endSeq, '', first.finalCode).length, 2);
    const source = readFileSync(new URL('../src/components/editor/scratchpad.tsx', import.meta.url), 'utf8');
    assert.match(source, /pretest \? '' : await flushReplay\(code\)/);
    assert.doesNotMatch(source, /resetReplaySession/);
});

test('restored data keeps sequence/time and reconciles a cached-code change with one minimal delta', () => {
    const recording = newRecording('', 1000);
    recordCode(recording, 'hello world', 'cc', undefined, 1100);
    const restored = plain(recording);
    recordCode(restored, 'hello World', 'cc', undefined, 900);
    assert.equal(restored.sessionId, recording.sessionId);
    assert.equal(restored.sequence, 2);
    assert.equal(restored.events[1].t, 100);
    assert.deepEqual(plain(restored.events[1].changes), [{ rangeOffset: 6, rangeLength: 1, text: 'W' }]);
    assert.equal(continuousPrefix(restored.events, 2, '', 'hello World').length, 2);
});

test('checkpoint rejects missing/conflicting events and final-code mismatches instead of hiding gaps with snapshots', () => {
    const recording = newRecording('', 0);
    recordCode(recording, 'a', 'cc', undefined, 1);
    recordCode(recording, 'ab', 'cc', undefined, 2);
    const events = recording.events;
    assert.equal(continuousPrefix([...events, events[0]], 2, '', 'ab').length, 2);
    assert.throws(() => continuousPrefix([events[1]], 2, '', 'ab'), /Incomplete/);
    assert.throws(() => continuousPrefix([...events, { ...events[0], t: 9 }], 2, '', 'ab'), /Conflicting/);
    assert.throws(() => continuousPrefix(events, 2, '', 'wrong'), /match/);
    assert.throws(() => continuousPrefix(events, -1, '', ''), /Invalid/);
});

test('upload sends only unsent events and freezes a cutoff while editing continues', async () => {
    const recording = newRecording('', 0);
    for (let i = 1; i <= 450; i++) recordCode(recording, 'x'.repeat(i), 'cc', undefined, i);
    const checkpoint = recordingCheckpoint(recording, 500);
    const requests: any[] = [];
    const checkpointId = 'c'.repeat(48);
    const result = await uploadRecordingCheckpoint(checkpoint, async (payload: any) => {
        requests.push(payload);
        if (payload.action === 'status') {
            recordCode(recording, 'later edit', 'cc', undefined, 600);
            return { replayVersion: 2, uploadedSeq: 200 };
        }
        return { replayVersion: 2, sessionId: checkpointId };
    });
    assert.equal(result, checkpointId);
    const batches = requests.filter((request) => request.action === 'append');
    assert.deepEqual(batches.map((request) => request.events.length), [200, 50]);
    assert.equal(batches[0].events[0].seq, 201);
    assert.equal(requests.at(-1).endSeq, 450);
    assert.equal(requests.at(-1).finalCode, 'x'.repeat(450));
    assert.equal(recording.sequence, 451);
});

test('failed upload keeps all events for retry and rejects incompatible server protocols', async () => {
    const recording = newRecording('', 0);
    recordCode(recording, 'code', 'cc', undefined, 1);
    const checkpoint = recordingCheckpoint(recording, 2);
    await assert.rejects(uploadRecordingCheckpoint(checkpoint, async (payload: any) => {
        if (payload.action === 'status') return { replayVersion: 2, uploadedSeq: 0 };
        throw new Error('offline');
    }), /offline/);
    assert.equal(recording.events.length, 1);
    assert.equal(recording.currentCode, 'code');
    await assert.rejects(uploadRecordingCheckpoint(checkpoint, async () => ({ ok: 1 })), /does not support/);
});

test('list controls stay compact and training search order is input, select, button', () => {
    const source = readFileSync(new URL('../src/pages/training_main.tsx', import.meta.url), 'utf8');
    const toolbar = source.slice(source.indexOf('className="hydro-training-header-actions"'));
    assert.ok(toolbar.indexOf('<TextInput') < toolbar.indexOf('<ListSortSelect'));
    assert.ok(toolbar.indexOf('<ListSortSelect') < toolbar.indexOf('<Button'));
    const css = readFileSync(new URL('../src/styles/tailwind.css', import.meta.url), 'utf8');
    assert.match(css, /\.hydro-list-sort\s*\{\s*width: 140px/);
    assert.match(css, /grid-template-columns: 210px 110px 124px auto auto/);
});
