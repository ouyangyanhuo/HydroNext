import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProblemTimeTracker, formatContestClock } from '../src/utils/contest-problem-time.ts';

test('counts visible work across background pauses without counting hidden time', () => {
    const timer = createProblemTimeTracker({ beginAt: 0, endAt: 100_000, now: 0, elapsed: 0, visible: true });
    assert.equal(timer.tick(1500), 1500);
    assert.equal(timer.setVisible(false, 2500), 2500);
    assert.equal(timer.tick(50_000), 2500);
    assert.equal(timer.setVisible(true, 60_000), 2500);
    assert.equal(timer.tick(61_500), 4000);
});

test('clips delayed updates to the contest start and personal deadline', () => {
    const timer = createProblemTimeTracker({ beginAt: 10_000, endAt: 20_000, now: 0, elapsed: 0, visible: true });
    assert.equal(timer.tick(5000), 0);
    assert.equal(timer.tick(12_000), 2000);
    assert.equal(timer.tick(30_000), 10_000);
    assert.equal(timer.tick(40_000), 10_000);
});

test('restores accumulated time on reload without counting time spent on another problem', () => {
    const before = createProblemTimeTracker({ beginAt: 0, endAt: 100_000, now: 0, elapsed: 0, visible: true });
    const saved = before.setVisible(false, 6000);
    const after = createProblemTimeTracker({ beginAt: 0, endAt: 100_000, now: 25_000, elapsed: saved, visible: true });
    assert.equal(after.tick(28_000), 9000);
});

test('ignores backward clock changes and invalid persisted elapsed time', () => {
    const timer = createProblemTimeTracker({ beginAt: 0, endAt: 100_000, now: 10_000, elapsed: Number.NaN, visible: true });
    assert.equal(timer.tick(12_000), 2000);
    assert.equal(timer.tick(8000), 2000);
    assert.equal(timer.tick(13_000), 3000);
});

test('formats a stable clock, including durations longer than one day', () => {
    assert.equal(formatContestClock(-500), '00:00:00');
    assert.equal(formatContestClock(3_661_900), '01:01:01');
    assert.equal(formatContestClock(90_061_000), '25:01:01');
});
