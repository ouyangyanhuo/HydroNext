import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUserContributions } from '../statistics';

const DAY = 86_400_000;
const now = new Date('2026-10-15T04:00:00Z');

test('empty contribution history has six zero statistics and a stable site timezone', () => {
    assert.deepEqual(buildUserContributions([], now), {
        today: '2026-10-15', timeZone: 'Asia/Shanghai', days: [],
        summary: { total: 0, lastYear: 0, lastMonth: 0, longestStreak: 0, lastYearLongestStreak: 0, lastMonthLongestStreak: 0 },
    });
});

test('daily problem counts and streaks count problems and active calendar days separately', () => {
    const days = [
        { date: '2026-10-15', count: 1 }, { date: '2026-10-11', count: 3 },
        { date: '2026-10-14', count: 5 }, { date: '2025-01-01', count: 8 }, { date: '2026-10-13', count: 2 },
    ];
    const history = buildUserContributions(days, now);
    assert.deepEqual(history.summary, {
        total: 19, lastYear: 11, lastMonth: 11, longestStreak: 3, lastYearLongestStreak: 3, lastMonthLongestStreak: 3,
    });
    assert.equal(history.days[0].date, '2025-01-01');
    assert.equal(days[0].date, '2026-10-15');
});

test('recent windows include today and exactly 365 or 30 days', () => {
    const history = buildUserContributions([
        { date: '2025-10-15', count: 1 }, { date: '2025-10-16', count: 2 },
        { date: '2026-09-15', count: 4 }, { date: '2026-09-16', count: 8 }, { date: '2026-10-15', count: 16 },
    ], now);
    assert.equal(history.summary.total, 31);
    assert.equal(history.summary.lastYear, 30);
    assert.equal(history.summary.lastMonth, 24);
});

test('long streaks are clipped at each rolling window and cross calendar years', () => {
    const today = Date.parse('2026-10-15');
    const days = Array.from({ length: 400 }, (_, index) => ({
        date: new Date(today - index * DAY).toISOString().slice(0, 10), count: 1,
    }));
    assert.deepEqual(buildUserContributions(days, now).summary, {
        total: 400, lastYear: 365, lastMonth: 30, longestStreak: 400, lastYearLongestStreak: 365, lastMonthLongestStreak: 30,
    });
});

test('leap day remains part of a consecutive streak', () => {
    const history = buildUserContributions([
        { date: '2024-02-28', count: 1 }, { date: '2024-02-29', count: 1 }, { date: '2024-03-01', count: 1 },
    ], new Date('2024-03-01T04:00:00Z'));
    assert.equal(history.summary.longestStreak, 3);
});

test('site midnight changes at 16:00 UTC and future dates do not contribute', () => {
    const days = [{ date: '2026-01-01', count: 1 }, { date: '2026-01-02', count: 2 }];
    const before = buildUserContributions(days, new Date('2026-01-01T15:59:59Z'));
    const after = buildUserContributions(days, new Date('2026-01-01T16:00:00Z'));
    assert.equal(before.today, '2026-01-01');
    assert.equal(before.summary.total, 1);
    assert.equal(after.today, '2026-01-02');
    assert.equal(after.summary.total, 3);
    assert.equal(after.summary.longestStreak, 2);
});

test('inactive days break streaks and response days contain only dates and counts', () => {
    const days = [
        { date: '2026-10-13', count: 3, domainId: 'private', pid: 42 },
        { date: '2026-10-14', count: 0, domainId: 'private', pid: 43 },
        { date: '2026-10-15', count: 1, domainId: 'secret', pid: 44 },
    ];
    const history = buildUserContributions(days, now);
    assert.equal(history.summary.longestStreak, 1);
    assert.deepEqual(history.days, [{ date: '2026-10-13', count: 3 }, { date: '2026-10-15', count: 1 }]);
    assert.doesNotMatch(JSON.stringify(history), /private|secret|domainId|pid/);
});
