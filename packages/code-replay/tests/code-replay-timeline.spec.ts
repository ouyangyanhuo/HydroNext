import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReplayStates } from '../../code-replay/replay.ts';
import {
    advanceReplayTime, buildThinkingRanges, replayIndexAtTime, thinkingRangeAt,
} from '../../code-replay/timeline.ts';

test('marks only pauses of at least five seconds, including leading and trailing pauses', () => {
    assert.deepEqual(buildThinkingRanges([0, 6000, 6100, 7000, 12000], 18000), [
        { start: 0, end: 6000 }, { start: 7000, end: 12000 }, { start: 12000, end: 18000 },
    ]);
    assert.deepEqual(buildThinkingRanges([0, 100, 5099], 6000), []);
});

test('duration preserves thinking between the final edit and submission', () => {
    const replay = buildReplayStates([{ t: 1000, seq: 1, changes: [{ rangeOffset: 0, rangeLength: 0, text: 'x' }] }],
        [{ t: 15000, afterSeq: 1, code: 'x' }], '', 'x');
    assert.equal(replay.duration, 15000);
    assert.deepEqual(replay.times, [0, 1000]);
    assert.deepEqual(buildThinkingRanges(replay.times, replay.duration), [{ start: 1000, end: 15000 }]);
});

test('seeking within a pause preserves previous code and applies edits only at their timestamp', () => {
    const times = [0, 1000, 1000, 12000];
    assert.equal(replayIndexAtTime(times, 999), 0);
    assert.equal(replayIndexAtTime(times, 1000), 2);
    assert.equal(replayIndexAtTime(times, 11999), 2);
    assert.equal(replayIndexAtTime(times, 12000), 3);
    assert.equal(replayIndexAtTime(times, 50000), 3);
});

test('normal playback preserves every millisecond of a pause', () => {
    const ranges = [{ start: 1000, end: 10000 }];
    assert.equal(advanceReplayTime(1500, 50, 11000, ranges, false), 1550);
    assert.equal(advanceReplayTime(10990, 50, 11000, ranges, false), 11000);
    assert.equal(advanceReplayTime(1500, 0, 11000, ranges, false), 1500);
});

test('skip works when enabled in the middle of a pause without altering active playback speed', () => {
    const ranges = [{ start: 1000, end: 10000 }];
    assert.equal(advanceReplayTime(1500, 50, 11000, ranges, true), 10050);
    assert.equal(advanceReplayTime(900, 200, 11000, ranges, true), 10100);
    assert.equal(advanceReplayTime(10000, 50, 11000, ranges, true), 10050);
    assert.equal(advanceReplayTime(0, 200, 11000, ranges, true), 200);
});

test('one tick can cross multiple idle regions and safely reach the end', () => {
    const ranges = [{ start: 1000, end: 7000 }, { start: 7500, end: 20000 }];
    assert.equal(advanceReplayTime(900, 800, 21000, ranges, true), 20200);
    assert.equal(advanceReplayTime(900, 5000, 21000, ranges, true), 21000);
});

test('pause boundaries are half-open and short edits between pauses remain reachable', () => {
    const ranges = [{ start: 1000, end: 7000 }, { start: 7500, end: 20000 }];
    assert.equal(thinkingRangeAt(ranges, 999), undefined);
    assert.deepEqual(thinkingRangeAt(ranges, 1000), ranges[0]);
    assert.equal(thinkingRangeAt(ranges, 7000), undefined);
    assert.deepEqual(thinkingRangeAt(ranges, 19999), ranges[1]);
    assert.equal(thinkingRangeAt(ranges, 20000), undefined);
});

test('empty recordings, duplicate timestamps and all-idle recordings do not hang', () => {
    assert.deepEqual(buildThinkingRanges([0, 0, 0], 0), []);
    assert.equal(replayIndexAtTime([], 0), 0);
    assert.equal(advanceReplayTime(0, 50, 0, [], true), 0);
    const ranges = buildThinkingRanges([0], 6000);
    assert.deepEqual(ranges, [{ start: 0, end: 6000 }]);
    assert.equal(advanceReplayTime(0, 50, 6000, ranges, true), 6000);
});

test('legacy records without a final snapshot fall back to last edit time', () => {
    const result = buildReplayStates([{ t: 12000, type: 'insert', text: 'x' }], [], '', 'x');
    assert.equal(result.duration, 12000);
    assert.deepEqual(buildThinkingRanges(result.times, result.duration), [{ start: 0, end: 12000 }]);
});
