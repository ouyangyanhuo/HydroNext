import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatScore, mergeLiveRecord } from '../src/utils/record-list.ts';

test('score formatting preserves three-digit scores, rounding and invalid-value fallbacks', () => {
    assert.equal(formatScore(100), '100');
    assert.equal(formatScore(0), '0');
    assert.equal(formatScore('98.125'), '98.13');
    assert.equal(formatScore(-1), '-1');
    for (const value of [undefined, Number.NaN, Infinity, 'invalid']) assert.equal(formatScore(value), '-');
});

test('live updates preserve pagination order and do not mutate current records', () => {
    const current = [{ _id: 'a', status: 0, uid: 2 }, { _id: 'b', status: 1 }];
    const next = mergeLiveRecord(current, { _id: 'a', status: 1, score: 100 }, {
        matches: true, page: 2, allowPush: true, limit: 25,
    });
    assert.notEqual(next, current);
    assert.deepEqual(next, [{ _id: 'a', status: 1, uid: 2, score: 100 }, current[1]]);
    assert.equal(current[0].status, 0);
});

test('filter changes remove nonmatching records and never insert them', () => {
    const current = [{ _id: 'a' }, { _id: 'b' }];
    const options = { matches: false, page: 1, allowPush: true, limit: 25 };
    assert.deepEqual(mergeLiveRecord(current, { _id: 'a' }, options), [{ _id: 'b' }]);
    assert.equal(mergeLiveRecord(current, { _id: 'c' }, options), current);
});

test('new records only appear on the first page with push enabled and respect 25/50 row limits', () => {
    const current = Array.from({ length: 50 }, (_, index) => ({ _id: String(index) }));
    const fresh = { _id: 'new', score: 100 };
    for (const limit of [25, 50]) {
        const options = { matches: true, page: 1, allowPush: true, limit };
        const next = mergeLiveRecord(current, fresh, options);
        assert.equal(next.length, limit);
        assert.equal(next[0], fresh);
        assert.equal(mergeLiveRecord(current, fresh, { ...options, page: 2 }), current);
        assert.equal(mergeLiveRecord(current, fresh, { ...options, allowPush: false }), current);
    }
    assert.equal(current.length, 50);
});
