import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { resolveUpdateMock } from './mock-api.ts';

const require = createRequire(import.meta.url);
function fixture(fail = false) {
    const pending = Array.from({ length: 30 }, (_, index) => (index + 1).toString(16).padStart(24, '0'));
    const config = { _id: 'settings', cleanupAssets: [...pending], deletedAssets: [...pending] };
    let rows = pending.map((id) => ({ _id: new ObjectId(id), path: `client-update/${id}/app.asar` }));
    const calls: any[] = [];
    const collections: any = {
        'client-update.settings': {
            findOne: async () => config,
            updateOne: async (_: any, update: any) => {
                const done = update.$pull.cleanupAssets.$in;
                config.cleanupAssets = config.cleanupAssets.filter((id) => !done.includes(id));
                calls.push('clear-outbox');
            },
        },
        'client-update.asset': {
            createIndex: async () => { calls.push('create-index'); },
            find: (query: any) => ({ toArray: async () => rows.filter((row) => query._id.$in.some((id: ObjectId) => id.equals(row._id))) }),
            deleteMany: async (query: any) => {
                rows = rows.filter((row) => !query._id.$in.some((id: ObjectId) => id.equals(row._id)));
                calls.push('delete-metadata');
            },
        },
    };
    const mocks: any = {
        '../service/db': { __esModule: true, default: { collection: (name: string) => collections[name] } },
        './storage': { __esModule: true, default: { del: async (paths: string[]) => {
            calls.push(paths);
            if (fail) throw new Error('storage unavailable');
        } } },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../model.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
    runInNewContext(code, { module, exports: module.exports,
        require: (name: string) => resolveUpdateMock(name, mocks, require) });
    return { model: module.exports, config, pending, calls, rows: () => rows };
}

test('background cleanup is bounded, removes metadata after file deletion, and retains protection tombstones', async () => {
    const f = fixture();
    await f.model.cleanupDeletedAssets();
    assert.equal(f.calls[0].length, 25);
    assert.deepEqual(f.calls.slice(1), ['delete-metadata', 'clear-outbox']);
    assert.equal(f.rows().length, 5);
    assert.equal(f.config.cleanupAssets.length, 5);
    assert.equal(f.config.deletedAssets.length, 30);
    await f.model.cleanupDeletedAssets();
    assert.equal(f.rows().length, 0);
    assert.equal(f.config.cleanupAssets.length, 0);
});

test('Hydro model and addon loading initialize cleanup once under the addon lifecycle', async () => {
    const f = fixture();
    const directory = dirname(fileURLToPath(new URL('../model.ts', import.meta.url)));
    const intervals: (() => Promise<void>)[] = [];
    let routes = 0;
    const modules = new Map<string, any>([[`${directory}/model.ts`, f.model]]);
    function load(filename: string, dependencies: Record<string, any>) {
        const module = { exports: {} as any };
        const code = transformSync(readFileSync(new URL(filename, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
        runInNewContext(code, { module, exports: module.exports,
            require: (name: string) => modules.get(name) || dependencies[name] || require(name) });
        return module.exports;
    }
    modules.set(`${directory}/index.ts`, load('../index.ts', {
        './model': f.model,
        './handler': { apply: () => { routes++; } },
    }));
    const loaders = load('../../hydrooj/src/entry/common.ts', {
        '../lib/index': {},
        '../logger': { Logger: class { info() {} error(error: unknown) { throw error; } } },
        '../model/builtin': {},
        '../utils': { unwrapExports: (value: any) => value },
        'fs-extra': { existsSync: (filename: string) => modules.has(filename) },
    });
    const ctx = {
        interval: (callback: () => Promise<void>) => { intervals.push(callback); },
        loader: { reloadPlugin: async (filename: string) => modules.get(filename).apply(ctx) },
    };
    const pending = { 'client-updates': directory };
    await loaders.model(pending, [], ctx);
    assert.equal(intervals.length, 0, 'Model discovery must not start an independent cleanup task.');
    await loaders.addon(pending, [], ctx);
    assert.equal(intervals.length, 1);
    assert.equal(routes, 1);
    assert.deepEqual(f.calls, ['create-index']);
    await intervals[0]();
    assert.equal(f.rows().length, 5, 'The registered task still processes the bounded deletion queue.');
});

test('failed storage cleanup leaves the durable outbox intact for a subsequent retry', async () => {
    const f = fixture(true);
    await assert.rejects(f.model.cleanupDeletedAssets());
    assert.equal(f.rows().length, 30);
    assert.equal(f.config.cleanupAssets.length, 30);
    assert.equal(f.calls.length, 1);
});

test('interactive deletion cleans its own package even when an older backlog exceeds one batch', async () => {
    const f = fixture();
    await f.model.cleanupDeletedAssets(f.pending[29]);
    assert.equal(f.calls[0].length, 1);
    assert.ok(f.calls[0][0].includes(f.pending[29]));
    assert.ok(!f.config.cleanupAssets.includes(f.pending[29]));
    assert.equal(f.rows().length, 29);
});
