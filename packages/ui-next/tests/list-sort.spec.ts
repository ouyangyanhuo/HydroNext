import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isListSort, listSortUrl, readListSort, restoreListSortUrl, saveListSort } from '../src/utils/list-sort.ts';

test('list preferences are persisted separately and invalid values are ignored', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
    assert.equal(readListSort('problem', storage), 'default');
    saveListSort('problem', 'desc', storage);
    saveListSort('training', 'recent', storage);
    assert.equal(readListSort('problem', storage), 'desc');
    assert.equal(readListSort('training', storage), 'recent');
    data.set('hydro:list-sort:v1:problem', 'invalid');
    assert.equal(readListSort('problem', storage), 'default');
    assert.equal(isListSort(null), false);
});

test('storage errors do not prevent sorting', () => {
    const storage = {
        getItem() { throw new Error('Storage blocked'); },
        setItem() { throw new Error('Storage full'); },
    };
    assert.equal(readListSort('problem', storage), 'default');
    assert.doesNotThrow(() => saveListSort('training', 'asc', storage));
});

test('changing order resets pagination but retains domain, filters and hash', () => {
    const result = listSortUrl('https://oj.example/d/team/training?page=4&q=graph&category=abc#list', 'asc');
    assert.equal(result, '/d/team/training?q=graph&category=abc&sort=asc#list');
    assert.equal(listSortUrl('https://team.example/p?page=3&q=sort', 'desc'), '/p?q=sort&sort=desc');
});

test('restoring a preference preserves a bookmarked page', () => {
    assert.equal(restoreListSortUrl('https://oj.example/d/team/p?page=3', 'recent'), '/d/team/p?page=3&sort=recent');
    assert.equal(restoreListSortUrl('https://oj.example/training', 'default'), null);
});

test('explicit URLs, including default order, win over remembered preferences', () => {
    assert.equal(restoreListSortUrl('https://oj.example/p?sort=default', 'desc'), null);
    assert.equal(restoreListSortUrl('https://oj.example/training?sort=asc', 'recent'), null);
    assert.equal(listSortUrl('https://oj.example/p?sort=desc&page=4', 'default'), '/p?sort=default');
});
