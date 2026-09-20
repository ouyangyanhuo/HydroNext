import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toBigInt } from '../src/utils/permissions.ts';

test('parses server-serialized domain permissions without losing high bits', () => {
    const rankingPermission = 1n << 59n;
    const serialized = `BigInt::${rankingPermission | 1n}`;
    assert.equal(toBigInt(serialized) & rankingPermission, rankingPermission);
    assert.equal(toBigInt(serialized), rankingPermission | 1n);
});

test('accepts native and decimal permissions and rejects invalid values', () => {
    assert.equal(toBigInt(42n), 42n);
    assert.equal(toBigInt('42'), 42n);
    assert.equal(toBigInt('42n'), 42n);
    assert.equal(toBigInt('BigInt::invalid'), 0n);
    assert.equal(toBigInt(undefined), 0n);
});
