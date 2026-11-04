import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { test } from 'node:test';
import { formatRelative } from '../src/utils/datetime.ts';

const readYaml = (path: string) => load(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, string>;

test('locales define future relative time strings', () => {
    const en = readYaml('../locales/en.yaml');
    const zh = readYaml('../locales/zh.yaml');
    const zhTW = readYaml('../locales/zh_TW.yaml');
    const ja = readYaml('../locales/ja.yaml');
    const ko = readYaml('../locales/ko.yaml');

    for (const dict of [en, zh, zhTW, ja, ko]) {
        assert.ok(dict['in {0}m'], 'Missing in {0}m key');
        assert.ok(dict['in {0}h'], 'Missing in {0}h key');
        assert.ok(dict['in {0}d'], 'Missing in {0}d key');
    }

    assert.equal(zh['in {0}m'], '{0} 分钟后');
    assert.equal(zh['in {0}h'], '{0} 小时后');
    assert.equal(zh['in {0}d'], '{0} 天后');

    assert.equal(zhTW['in {0}m'], '{0} 分鐘後');
    assert.equal(zhTW['in {0}h'], '{0} 小時後');
    assert.equal(zhTW['in {0}d'], '{0} 天後');

    assert.equal(ja['in {0}m'], '{0}分後');
    assert.equal(ja['in {0}h'], '{0}時間後');
    assert.equal(ja['in {0}d'], '{0}日後');

    assert.equal(ko['in {0}m'], '{0}분 후');
    assert.equal(ko['in {0}h'], '{0}시간 후');
    assert.equal(ko['in {0}d'], '{0}일 후');
});

test('formatRelative formats past and future timestamps appropriately', () => {
    const zh = readYaml('../locales/zh.yaml');
    const tZh = (key: string) => zh[key] || key;

    // Past
    assert.equal(formatRelative(new Date(Date.now() - 10_000), tZh), '刚刚');
    assert.equal(formatRelative(new Date(Date.now() - (5 * 60_000 + 2000)), tZh), '5 分钟前');
    assert.equal(formatRelative(new Date(Date.now() - (3 * 3600_000 + 2000)), tZh), '3 小时前');
    assert.equal(formatRelative(new Date(Date.now() - (4 * 86400_000 + 2000)), tZh), '4 天前');

    // Future: must NEVER return "刚刚" when beyond threshold
    assert.notEqual(formatRelative(new Date(Date.now() + 10_000), tZh), '刚刚');
    assert.equal(formatRelative(new Date(Date.now() + 10_000), tZh), '1 分钟后');
    assert.equal(formatRelative(new Date(Date.now() + (15 * 60_000 + 2000)), tZh), '15 分钟后');
    assert.equal(formatRelative(new Date(Date.now() + (2 * 3600_000 + 2000)), tZh), '2 小时后');
    assert.equal(formatRelative(new Date(Date.now() + (5 * 86400_000 + 2000)), tZh), '5 天后');

    // Distant dates fall back to toLocaleDateString
    const distantFuture = new Date(Date.now() + 45 * 86400_000);
    assert.equal(formatRelative(distantFuture, tZh), distantFuture.toLocaleDateString());
});
