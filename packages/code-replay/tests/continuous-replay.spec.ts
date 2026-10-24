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
const {
    continueRecording, newRecording, recordAction, recordCode, recordingCheckpoint, uploadRecordingCheckpoint,
} = loadModule('../ui/components/editor/replay-recording.ts');
const { continuousPrefix } = loadModule('../../code-replay/continuous.ts');
const { buildReplayStates } = loadModule('../../code-replay/replay.ts');
const plain = (value: any) => JSON.parse(JSON.stringify(value));

test('every submission includes the full ordered template, paste and self-test history without changing code', () => {
    const recording = newRecording('', 1000);
    recordAction(recording, 'template', 'cc', undefined, 1100);
    recordCode(recording, 'abc', 'cc', undefined, 1100);
    const first = recordingCheckpoint(recording, 1200);
    const next = continueRecording(recording, first);
    recordCode(next, 'abcd', 'cc', undefined, 1300);
    recordAction(next, 'paste', 'cc', 1, 1300);
    recordAction(next, 'self_test', 'cc', undefined, 1400);
    recordCode(next, 'acd', 'cc', undefined, 1500);
    recordAction(next, 'submit', 'cc', undefined, 1600);
    const checkpoint = recordingCheckpoint(next, 1700);
    const validated = continuousPrefix(checkpoint.events, checkpoint.endSeq, checkpoint.initialCode, checkpoint.finalCode);
    assert.equal(checkpoint.endSeq, 7);
    assert.equal(checkpoint.initialCode, '');
    assert.deepEqual(plain(validated.map((event: any) => event.action).filter(Boolean)), ['template', 'paste', 'self_test', 'submit']);
    assert.deepEqual(plain(buildReplayStates(validated, [], '', 'acd').states), ['', '', 'abc', 'abcd', 'abcd', 'abcd', 'acd', 'acd']);
    assert.deepEqual(plain(validated.filter((event: any) => event.action).map((event: any) => [event.t, event.timestamp])), [
        [100, 1100], [300, 1300], [400, 1400], [600, 1600],
    ]);
    assert.throws(() => continuousPrefix([{ seq: 1, t: 0, changes: [], action: 'unknown' }], 1, '', ''), /Invalid/);
    assert.throws(() => continuousPrefix([{ seq: 1, t: 0, changes: [] }], 1, '', ''), /Invalid/);
});

test('formal submissions and self-tests preserve the full timeline, while older checkpoints remain frozen', () => {
    const recording = newRecording('', 1000);
    recordCode(recording, 'abc', 'cc', undefined, 1100);
    const first = recordingCheckpoint(recording, 1150);
    const next = continueRecording(recording, first);
    recordCode(next, 'adc', 'cc', undefined, 1200);
    // Self-test neither calls the uploader nor changes the recording session.
    const sessionId = next.sessionId;
    recordCode(next, 'ad', 'cc', undefined, 1400);
    const second = recordingCheckpoint(next, 1500);
    assert.equal(next.sessionId, sessionId);
    assert.equal(next, recording);
    assert.equal(first.endSeq, 1);
    assert.equal(second.endSeq, 3);
    assert.deepEqual(plain(buildReplayStates(first.events, [], first.initialCode, first.finalCode).states), ['', 'abc']);
    assert.deepEqual(plain(buildReplayStates(second.events, [], second.initialCode, second.finalCode).states), ['', 'abc', 'adc', 'ad']);
    assert.equal(continuousPrefix(second.events, second.endSeq, second.initialCode, second.finalCode).length, 3);
    const source = readFileSync(new URL('../../ui-next/src/components/editor/scratchpad.tsx', import.meta.url), 'utf8');
    const recorder = readFileSync(new URL('../ui/recorder.ts', import.meta.url), 'utf8');
    assert.match(source, /pretest \? null : await editorAddon\?\.beforeSubmit\(code, lang\)/);
    assert.match(recorder, /result\.codeReplayCommitted && recording === current/);
    assert.ok(recorder.indexOf('result.codeReplayError') < recorder.indexOf('result.codeReplayCommitted'));
    assert.ok(source.indexOf('await addonReceipt?.complete(data)') < source.indexOf('if (data.rid) navigate'));
    assert.doesNotMatch(source, /resetReplaySession/);
});

test('successful submission preserves all history and in-flight edits without rebasing time or sequence', () => {
    const recording = newRecording('', 1000);
    recordCode(recording, 'abc', 'cc', undefined, 1100);
    const checkpoint = recordingCheckpoint(recording, 1200);
    recordCode(recording, 'abcd', 'cc', undefined, 1300);
    recordCode(recording, 'acd', 'cc', undefined, 1400);
    const next = continueRecording(recording, checkpoint);
    assert.equal(next.startedAt, 1000);
    assert.equal(next.lastTime, 400);
    assert.deepEqual(plain(next.events.map(({ seq, t }: any) => [seq, t])), [[1, 100], [2, 300], [3, 400]]);
    assert.deepEqual(plain(buildReplayStates(next.events, [], next.initialCode, next.currentCode).states), ['', 'abc', 'abcd', 'acd']);
    assert.equal(recording.events.length, 3);
    assert.equal(checkpoint.events.length, 1);
    assert.throws(() => continueRecording(newRecording(''), checkpoint), /does not belong/);
});

test('repeated submissions without editing still include all previously recorded edits', () => {
    const recording = newRecording('int main() {}', 1000);
    recordCode(recording, 'int main() { return 0; }', 'cc', undefined, 1050);
    const first = recordingCheckpoint(recording, 1100);
    const next = continueRecording(recording, first);
    const second = recordingCheckpoint(next, 1200);
    assert.equal(second.endSeq, 1);
    assert.equal(second.initialCode, first.initialCode);
    assert.equal(second.finalCode, first.finalCode);
    assert.equal(continuousPrefix(second.events, 1, second.initialCode, second.finalCode).length, 1);
    assert.deepEqual(plain(second.events), plain(first.events));
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
    const source = readFileSync(new URL('../../ui-next/src/pages/training_main.tsx', import.meta.url), 'utf8');
    const toolbar = source.slice(source.indexOf('className="hydro-training-header-actions"'));
    assert.ok(toolbar.indexOf('<TextInput') < toolbar.indexOf('<ListSortSelect'));
    assert.ok(toolbar.indexOf('<ListSortSelect') < toolbar.indexOf('<Button'));
    const css = readFileSync(new URL('../../ui-next/src/styles/tailwind.css', import.meta.url), 'utf8');
    assert.match(css, /\.hydro-list-sort\s*\{\s*width: 140px/);
    assert.match(css, /grid-template-columns: 210px 110px 124px auto auto/);
});
