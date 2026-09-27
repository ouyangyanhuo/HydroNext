import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPaginationUrl } from '../src/utils/pagination.ts';

test('profile pagination keeps the explicit domain, user and accepted tab', () => {
    assert.equal(buildPaginationUrl('/d/A266606/user/42?tab=accepted', { page: 2 }, 'https://oj.example'),
        '/d/A266606/user/42?tab=accepted&page=2');
});

test('profile pagination on a custom domain does not add an unrelated domain prefix', () => {
    assert.equal(buildPaginationUrl('/user/42?tab=accepted&page=2', { page: 3 }, 'https://team.example'),
        '/user/42?tab=accepted&page=3');
});
