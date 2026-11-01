import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRecordSocketUrl } from '../src/utils/record-socket-url.ts';
import { buildWebSocketUrl, pageDomainPath } from '../src/utils/websocket-url.ts';

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

for (const example of [
    { name: '普通比赛域', page: 'https://oj.example/d/exam/p/1', domain: 'exam', prefix: '/', path: '/d/exam/record-detail-conn' },
    { name: '显式系统域', page: 'https://oj.example/d/system/record/rid', domain: 'system', prefix: '/', path: '/d/system/record-detail-conn' },
    { name: '系统域根路径', page: 'https://oj.example/record/rid', domain: 'system', prefix: '/', path: '/record-detail-conn' },
    { name: '绑定独立域名', page: 'https://exam.example/record/rid', domain: 'exam', prefix: '/', path: '/record-detail-conn' },
    { name: '旧域前缀', page: 'https://oj.example/d/exam/p/1', domain: 'exam', prefix: '/d/old/', path: '/d/exam/record-detail-conn' },
    { name: '系统域清除旧前缀', page: 'https://oj.example/record/rid', domain: 'system', prefix: '/d/old/', path: '/record-detail-conn' },
    { name: '独立 WebSocket 地址', page: 'https://oj.example/d/exam/p/1', domain: 'exam',
        prefix: 'wss://socket.example/edge/d/old/', path: '/edge/d/exam/record-detail-conn' },
]) {
    test(`结果连接与页面保持域路径一致：${example.name}`, () => {
        const rid = '6aafb35ebcd1e21396c25c8d';
        const url = new URL(buildWebSocketUrl({ url: buildRecordSocketUrl(rid, example.domain),
            prefix: example.prefix, pageUrl: example.page, domainPath: pageDomainPath(new URL(example.page).pathname) }));
        assert.equal(url.pathname, example.path);
        assert.equal(url.protocol, 'wss:');
        assert.equal(url.searchParams.get('rid'), rid);
        assert.equal(url.searchParams.get('domainId'), example.domain);
        assert.equal(url.searchParams.get('noTemplate'), 'true');
        assert.equal(url.hostname, example.prefix.startsWith('wss:') ? 'socket.example' : new URL(example.page).hostname);
    });
}
