import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatUserName } from '../src/utils/user-name.ts';

test('shows the domain display name before the account username', () => {
    assert.equal(formatUserName({ uname: 'alice', displayName: '小艾' }), '小艾 (alice)');
});

test('does not repeat identical display names', () => {
    assert.equal(formatUserName({ uname: 'alice', displayName: 'alice' }), 'alice');
});

test('falls back to username and user id', () => {
    assert.equal(formatUserName({ uname: 'alice' }), 'alice');
    assert.equal(formatUserName({ _id: 42 }), '42');
});
