import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goBackOrFallback } from '../src/utils/history-back.ts';

test('replay back returns to the actual previous entry with domain, query and hash intact', () => {
    for (const previous of [
        '/d/team/record?page=3&uid=42#records',
        '/d/team/record/abc?tid=123',
        '/p/100?tid=123#editor',
    ]) {
        const entries = [previous, '/d/team/code-replay/abc'];
        let index = 1;
        goBackOrFallback({ length: entries.length, back() { index--; } }, () => assert.fail('Must use history'));
        assert.equal(index, 0);
        assert.equal(entries[index], previous);
    }
});

test('directly opened replay uses fallback when no previous entry exists', () => {
    let fallbackCalls = 0;
    goBackOrFallback({ length: 1, back() { assert.fail('No history to return to'); } }, () => {
        fallbackCalls++;
    });
    assert.equal(fallbackCalls, 1);
});

test('returning removes no history entries and does not push another replay entry', () => {
    const entries = ['/record?page=2', '/record/abc', '/code-replay/abc'];
    let index = 2;
    const history = { length: entries.length, back() { index--; } };
    goBackOrFallback(history, () => assert.fail('Must use history'));
    assert.equal(entries[index], '/record/abc');
    assert.equal(entries.length, 3);
    index++; // Browser forward, then return from the replay again.
    goBackOrFallback(history, () => assert.fail('Must use history'));
    assert.equal(entries[index], '/record/abc');
});
