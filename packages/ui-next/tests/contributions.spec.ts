import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contributionCalendar, contributionLevel } from '../src/utils/contributions';

test('calendar includes leap days and aligns Sunday to Saturday in weekly columns', () => {
    const { dates, weeks } = contributionCalendar(2024, [{ date: '2024-02-29', count: 7 }], '2026-10-15');
    assert.equal(dates.length, 366);
    assert.equal(weeks, 53);
    assert.equal(dates[0].row, 3); // January 1, 2024 was Monday.
    assert.equal(dates[0].column, 2);
    assert.equal(dates.find((day) => day.date === '2024-02-29')?.count, 7);
    assert.equal(dates.at(-1)?.date, '2024-12-31');
    assert.equal(dates.find((day) => day.date === '2024-01-07')?.row, 2);
    assert.equal(dates.find((day) => day.date === '2024-01-07')?.column, 3);
});

test('year changes show only that year and future dates stay unavailable', () => {
    const days = [{ date: '2025-12-31', count: 4 }, { date: '2026-01-01', count: 2 }];
    const previous = contributionCalendar(2025, days, '2026-01-01');
    const current = contributionCalendar(2026, days, '2026-01-01');
    assert.equal(previous.dates.length, 365);
    assert.equal(previous.dates.reduce((sum, day) => sum + day.count, 0), 4);
    assert.equal(current.dates.reduce((sum, day) => sum + day.count, 0), 2);
    assert.equal(current.dates[0].future, false);
    assert.equal(current.dates[1].future, true);
});

test('a leap year starting on Saturday uses all 54 week columns', () => {
    const calendar = contributionCalendar(2000, [], '2026-10-15');
    assert.equal(calendar.weeks, 54);
    assert.equal(calendar.dates.at(-1)?.column, 55);
});

test('heatmap intensity has stable absolute thresholds including empty days', () => {
    assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 10, 100].map(contributionLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});
