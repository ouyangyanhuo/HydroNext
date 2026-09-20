import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRecordSocketUrl } from '../src/utils/record-socket-url.ts';

for (const domainId of ['A266606', 'system']) {
    test(`subscribes to a record in the ${domainId} domain`, () => {
        const url = new URL(buildRecordSocketUrl('6aafb35ebcd1e21396c25c8d', domainId), 'wss://oj.example/');
        assert.equal(url.pathname, '/record-detail-conn');
        assert.equal(url.searchParams.get('rid'), '6aafb35ebcd1e21396c25c8d');
        assert.equal(url.searchParams.get('noTemplate'), 'true');
        assert.equal(url.searchParams.get('domainId'), domainId);
    });
}

test('keeps the record connection disabled until a record id is available', () => {
    assert.equal(buildRecordSocketUrl(undefined, 'system'), 'record-detail-conn');
});
