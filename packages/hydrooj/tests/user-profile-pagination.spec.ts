import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginateAcceptedProblems } from '../src/lib/user-profile-pagination';

const problems = Array.from({ length: 123 }, (_, i) => ({ docId: i + 1, tag: [i < 100 ? 'arrays' : 'graphs'] }));

test('accepted problem pages contain at most 50 unique entries', () => {
    const pages = [1, 2, 3].map((page) => paginateAcceptedProblems(problems, page));
    assert.deepEqual(pages.map((page) => page.ids.length), [50, 50, 23]);
    assert.deepEqual(pages.flatMap((page) => page.ids), problems.map((p) => p.docId));
    assert.ok(pages.every((page) => page.total === 123 && page.pageCount === 3 && page.pageSize === 50));
});

test('tag totals represent the whole visible accepted set, not only the selected page', () => {
    assert.deepEqual(paginateAcceptedProblems(problems, 3).tags, [{ name: 'arrays', count: 100 }, { name: 'graphs', count: 23 }]);
});

test('clamps invalid and out-of-range pages and preserves deterministic ordering', () => {
    assert.equal(paginateAcceptedProblems(problems, 999).page, 3);
    assert.equal(paginateAcceptedProblems(problems, -1).page, 1);
    assert.equal(paginateAcceptedProblems(problems, Number.NaN).page, 1);
    assert.deepEqual(paginateAcceptedProblems([...problems].reverse(), 2).ids, problems.slice(50, 100).map((p) => p.docId));
});

test('empty and exactly-full accepted lists have a valid first page', () => {
    assert.deepEqual(paginateAcceptedProblems([], 8), { page: 1, pageCount: 1, pageSize: 50, total: 0, ids: [], tags: [] });
    assert.equal(paginateAcceptedProblems(problems.slice(0, 50)).pageCount, 1);
    assert.equal(paginateAcceptedProblems(problems.slice(0, 51)).pageCount, 2);
});
