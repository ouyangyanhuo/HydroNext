import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIST_SORT_MODES, PROBLEM_LIST_SORT, TRAINING_LIST_SORT } from '../src/lib/list-sort';

test('every public sorting mode has deterministic server ordering for both lists', () => {
    assert.deepEqual(Object.keys(PROBLEM_LIST_SORT), [...LIST_SORT_MODES]);
    assert.deepEqual(Object.keys(TRAINING_LIST_SORT), [...LIST_SORT_MODES]);
    for (const sort of [...Object.values(PROBLEM_LIST_SORT), ...Object.values(TRAINING_LIST_SORT)]) {
        assert.ok('docId' in sort || '_id' in sort, 'Pagination needs a unique tie breaker');
        assert.ok(Object.values(sort).every((direction) => direction === 1 || direction === -1));
    }
});

test('problem ID order and creation order are distinct, and descending reverses ascending', () => {
    assert.deepEqual(PROBLEM_LIST_SORT.asc, { sort: 1, docId: 1 });
    assert.deepEqual(PROBLEM_LIST_SORT.desc, { sort: -1, docId: -1 });
    assert.deepEqual(PROBLEM_LIST_SORT.recent, { _id: -1 });
    assert.deepEqual(PROBLEM_LIST_SORT.oldest, { _id: 1 });
});

test('training preserves pinned default order but applies explicit title and date choices', () => {
    assert.deepEqual(TRAINING_LIST_SORT.default, { pin: -1, _id: -1 });
    assert.deepEqual(TRAINING_LIST_SORT.asc, { title: 1, _id: 1 });
    assert.deepEqual(TRAINING_LIST_SORT.desc, { title: -1, _id: -1 });
    assert.deepEqual(TRAINING_LIST_SORT.recent, { _id: -1 });
    assert.deepEqual(TRAINING_LIST_SORT.oldest, { _id: 1 });
});
