/* eslint-disable no-await-in-loop -- Verify each credential against an independent subscription attempt. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

function load(path: string, mocks: Record<string, any>) {
    const module = { exports: {} as any };
    runInNewContext(transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module, exports: module.exports, global: { Hydro: { model: {} } },
        require: (name: string) => mocks[name] ?? require(name),
    });
    return module.exports;
}

function fixture() {
    const queries: any[] = [];
    const token = load('../src/model/token.ts', {
        '../service/db': { __esModule: true, default: { collection: () => ({ findOne: async (query: any) => {
            queries.push(query);
            // Model a database that would match an injected query operator.
            return typeof query._id === 'object' || query._id === 'valid-session' ? { uid: 42 } : null;
        } }) } },
        '../utils': { ArgMethod: (_target: any, _name: string, descriptor: any) => descriptor },
    }).default;
    const connection = load('../src/handler/connection.ts', {
        '../error': { ForbiddenError: Error },
        '../model/system': { __esModule: true, default: { get: () => 'gateway-secret' } },
        '../model/token': { __esModule: true, default: token },
        '../model/user': { __esModule: true, default: { getById: async (_domain: string, uid: number) => ({ _id: uid }) } },
        '../service/server': { ConnectionHandler: class {} },
        '../utils': { Logger: class { info() {} } },
    });
    const registry: { Handler?: any } = {};
    connection.apply({ Connection: (_name: string, _path: string, handler: any) => { registry.Handler = handler; } });
    const h = new registry.Handler();
    const replies: any[] = [];
    const enabled: string[] = [];
    h.send = (reply: any) => replies.push(reply);
    h.ctx = {
        parallel: async (event: string, channel: string) => { if (event === 'subscription/enable') enabled.push(channel); },
        bail: async (_event: string, channel: string, user: any) => (
            channel === 'message' && user._id > 0 ? { ok: true, channel: `message:${user._id}` } : undefined
        ),
    };
    return { token, h, queries, replies, enabled };
}

test('token lookups reject non-string query operators before accessing the database', async () => {
    const { token, queries } = fixture();
    for (const credential of [{ $ne: null }, { $regex: '.*' }, ['valid-session'], 42, true, null, undefined, '']) {
        assert.equal(await token.get(credential, token.TYPE_SESSION), null);
    }
    assert.equal(queries.length, 0);
    assert.equal((await token.get('valid-session', token.TYPE_SESSION)).uid, 42);
    assert.equal(queries[0]._id, 'valid-session');
    assert.equal(queries[0].tokenType, token.TYPE_SESSION);
});

test('websocket credentials cannot inject queries; normal subscriptions and trusted gateway resume still work', async () => {
    const { h, queries, replies, enabled } = fixture();
    for (const credential of [{ $ne: null }, { $regex: '.*' }, ['valid-session'], 42, true, null, undefined, '']) {
        await h.subscribe({ operation: 'subscribe', credential, channels: ['message'], request_id: 'invalid' });
        assert.equal(replies.at(-1).request_id, 'invalid');
        assert.equal(replies.at(-1).accept.length, 0);
        assert.equal(replies.at(-1).reject[0], 'message');
    }
    assert.equal(queries.length, 0);
    assert.equal(enabled.length, 0);
    await h.subscribe({ operation: 'subscribe', credential: 'valid-session', channels: ['message'], subscription_id: 'normal' });
    assert.equal(replies.at(-1).accept[0], 'message:42');
    assert.equal(replies.at(-1).subscription_id, 'normal');
    assert.deepEqual(enabled, ['message:42']);
    await h.subscribe({ operation: 'resume', credential: { $ne: null }, channels: ['message:7'] });
    assert.equal(replies.at(-1).operation, 'resume_failed');
    assert.equal(queries.length, 1);
    h.request = { headers: { 'x-hydro-websocket-gateway': 'gateway-secret' }, ip: '127.0.0.1' };
    await h.prepare();
    await h.subscribe({ operation: 'resume', channels: ['message:7'] });
    assert.deepEqual(enabled, ['message:42', 'message:7']);
    assert.equal(queries.length, 1);
});
