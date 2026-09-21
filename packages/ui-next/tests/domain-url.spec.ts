import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDomainPrefix } from '../src/utils/domain-url.ts';

test('keeps the system domain unprefixed on the primary host', () => {
    assert.equal(getDomainPrefix('system', undefined, 'oj.example'), '');
});

test('prefixes links to a child domain on the primary host', () => {
    assert.equal(getDomainPrefix('team', undefined, 'oj.example'), '/d/team');
});

test('preserves the current child domain on the primary host', () => {
    assert.equal(getDomainPrefix('team', undefined, 'oj.example', 'team'), '/d/team');
});

test('keeps the current domain unprefixed on its custom host', () => {
    assert.equal(getDomainPrefix('team', ['team.example'], 'team.example'), '');
});

test('uses an explicit prefix when leaving a custom host for the system domain', () => {
    assert.equal(getDomainPrefix('team', 'team.example', 'team.example', 'system'), '/d/system');
});
