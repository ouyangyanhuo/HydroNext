import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEvent, buildReplayStates, captureReplayChanges, replayBatches } from '../../code-replay/replay.ts';

const edit = (t: number, rangeOffset: number, rangeLength: number, text: string, seq?: number) => ({
    t, seq, changes: [{ rangeOffset, rangeLength, text }],
});

test('legacy post-edit snapshots do not double-apply inserts or deletions', () => {
    const events = [edit(30_001, 0, 0, 'abc'), edit(30_002, 1, 1, ''), edit(30_003, 1, 1, 'd')];
    const snapshots = [{ t: 0, code: '' }, { t: 30_001, code: 'abc' }, { t: 30_002, code: 'ac' }];
    assert.deepEqual(buildReplayStates(events, snapshots, '', 'ad').states, ['', 'abc', 'ac', 'ad']);
});

test('legacy snapshots between same-millisecond events cannot roll code back', () => {
    const events = [edit(1, 0, 0, 'a'), edit(1, 1, 0, 'b'), edit(2, 2, 0, 'c')];
    assert.deepEqual(buildReplayStates(events, [{ t: 1, code: 'a' }], '', 'abc').states, ['', 'a', 'ab', 'abc']);
});

test('sequence checkpoints distinguish edits and a final snapshot at t=0', () => {
    const events = [edit(0, 0, 0, 'a', 1), edit(0, 1, 0, 'b', 2), edit(0, 0, 1, '', 3)];
    const snapshots = [{ t: 0, afterSeq: 0, code: '' }, { t: 0, afterSeq: 1, code: 'a' }, { t: 0, afterSeq: 3, code: 'b' }];
    assert.deepEqual(buildReplayStates(events, snapshots, '', 'b').states, ['', 'a', 'ab', 'b']);
});

test('out-of-order chunks, clock changes and duplicate retries preserve operation order', () => {
    const events = [edit(5, 1, 0, 'b', 2), edit(10, 0, 0, 'a', 1), edit(10, 0, 0, 'a', 1), edit(6, 0, 1, '', 3)];
    const result = buildReplayStates(events, [], '', 'b');
    assert.deepEqual(result.states, ['', 'a', 'ab', 'b']);
    assert.deepEqual(result.times, [0, 10, 10, 10]);
});

test('multi-cursor changes use pre-edit UTF-16 offsets and preserve CRLF', () => {
    const code = '你好🙂\r\nabc';
    const event = { changes: [{ rangeOffset: 0, rangeLength: 2, text: '你' }, { rangeOffset: 6, rangeLength: 3, text: 'xyz' }] };
    assert.equal(applyEvent(code, event), '你🙂\r\nxyz');
});

test('IME composition, undo, redo, deletion and template replacement replay exactly', () => {
    const events = [edit(1, 0, 0, 'n'), edit(2, 0, 1, 'ni'), edit(3, 0, 2, '你'), edit(4, 0, 1, ''),
        edit(5, 0, 0, '你'), edit(6, 0, 1, '#include <stdio.h>\n'), edit(7, 10, 5, 'stdlib')];
    assert.deepEqual(buildReplayStates(events, [], '').states, ['', 'n', 'ni', '你', '', '你',
        '#include <stdio.h>\n', '#include <stdlib.h>\n']);
});

test('more than 500 edits and 20 snapshots survive batching including late deletions', () => {
    const events = Array.from({ length: 1250 }, (_, i) => edit(i, i, 0, 'x', i + 1));
    events.push(edit(1251, 0, 1250, 'done', 1251));
    const snapshots = Array.from({ length: 65 }, (_, i) => ({ t: i * 10, afterSeq: i * 10, code: 'x'.repeat(i * 10) }));
    const batches = [...replayBatches(events, snapshots)];
    assert.ok(batches.every((batch) => batch.events.length <= 200 && batch.snapshots.length <= 20));
    assert.deepEqual(batches.flatMap((batch) => batch.events), events);
    assert.deepEqual(batches.flatMap((batch) => batch.snapshots), snapshots);
    const result = buildReplayStates(batches.flatMap((batch) => batch.events), batches.flatMap((batch) => batch.snapshots), '', 'done');
    assert.equal(result.states.length, 1252);
    assert.equal(result.states[1250], 'x'.repeat(1250));
    assert.equal(result.states[1251], 'done');
});

test('subsequent submissions begin from their own initial code, not the first session', () => {
    assert.deepEqual(buildReplayStates([edit(1, 0, 0, 'abc', 1)], [], '', 'abc').states, ['', 'abc']);
    assert.deepEqual(buildReplayStates([edit(1, 1, 1, 'd', 1)], [], 'abc', 'adc').states, ['abc', 'adc']);
});

test('snapshot-only and final-code-only recordings are playable', () => {
    assert.deepEqual(buildReplayStates([], [{ t: 0, afterSeq: 0, code: 'cached' }], 'cached', 'cached').states, ['cached']);
    assert.deepEqual(buildReplayStates([], [], '', 'submitted').states, ['', 'submitted']);
});

test('invalid ranges never invent appended characters; legacy event types remain supported', () => {
    assert.equal(applyEvent('abc', edit(0, 99, 0, 'ghost')), 'abc');
    assert.equal(applyEvent('abc', { type: 'delete', position: 1, length: 1 }), 'ac');
    assert.equal(applyEvent('abc', { type: 'replace', position: 1, length: 1, text: 'd' }), 'adc');
});

test('capture records EOL-only changes and model resets without losing text', () => {
    const previous = 'one\r\ntwo\r\n';
    const current = 'one\ntwo\n';
    const changes = captureReplayChanges(previous, current, []);
    assert.equal(applyEvent(previous, { changes }), current);
    const reset = captureReplayChanges(current, 'template', edit(0, 0, 99, 'template').changes);
    assert.equal(applyEvent(current, { changes: reset }), 'template');
    assert.deepEqual(captureReplayChanges(current, current, []), []);
});

test('normal input remains incremental instead of inserting a full code snapshot', () => {
    const changes = edit(0, 4, 0, 'x').changes;
    assert.deepEqual(captureReplayChanges('abcd', 'abcdx', changes), changes);
    const first = captureReplayChanges('abc', 'abcd', edit(0, 3, 0, 'd').changes);
    const second = captureReplayChanges('abcd', 'abd', edit(0, 2, 1, '').changes);
    assert.deepEqual(buildReplayStates([{ t: 0, seq: 1, changes: first }, { t: 0, seq: 2, changes: second }], [], 'abc').states,
        ['abc', 'abcd', 'abd']);
});
