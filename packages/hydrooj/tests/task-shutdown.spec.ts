import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const code = buildSync({ entryPoints: [fileURLToPath(new URL('../src/model/task.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['cac', 'mongodb', 'nanoid', '@hydrooj/utils/lib/utils', '../context', '../logger', '../service/bus', '../service/db'],
}).outputFiles[0].text;
function deferred() {
    let resolve: (value?: any) => void;
    let reject: (error: Error) => void;
    const promise = new Promise<any>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve: resolve!, reject: reject! };
}
async function fixture(ci = true) {
    const handlers = new Map<string, Set<Function>>();
    const streamHandlers = new Map<string, Function>();
    const errors: unknown[] = [];
    const query = deferred();
    const write = deferred();
    let queries = 0;
    let writes = 0;
    let closed = false;
    let task: any = ci ? null : { _id: 'task' };
    const stream = { on: (event: string, callback: Function) => streamHandlers.set(event, callback),
        close: async () => { closed = true; } };
    const events = { on: (event: string, callback: Function) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(callback);
        return () => { handlers.get(event)?.delete(callback); };
    }, parallel: async () => {} };
    const module = { exports: {} as any };
    runInNewContext(code, { module, exports: module.exports, global: { Hydro: { model: {} } },
        process: { env: { NODE_APP_INSTANCE: '0', CI: ci ? 'true' : '' } },
        require: (id: string) => {
            if (id === 'cac') return () => ({ parse: () => ({ options: {} }) });
            if (id === 'nanoid') return { nanoid: () => 'worker-id' };
            if (id === 'mongodb') return { ObjectId: class {}, BSON: { EJSON: { stringify: JSON.stringify, parse: JSON.parse } } };
            if (id === '@hydrooj/utils/lib/utils') return { sleep: () => new Promise(() => {}) };
            if (id === '../context') return {};
            if (id === '../logger') return { Logger: class { info() {} debug() {} error(error: unknown) { errors.push(error); } } };
            if (id === '../service/bus') return { default: events, __esModule: true };
            if (id === '../service/db') {
                return { default: { ensureIndexes: async () => {}, collection: (name: string) => (
                    name === 'event' ? { watch: () => stream,
                        insertOne: () => { writes++; return write.promise; },
                        findOneAndUpdate: () => { queries++; return query.promise; },
                    } : { findOneAndDelete: async () => {
                        const current = task;
                        task = null;
                        return current;
                    } }
                ) }, __esModule: true };
            }
            return require(id);
        } });
    const ctx = { on: events.on, effect: () => {} };
    await module.exports.apply(ctx);
    const exit = () => Promise.all([...handlers.get('app/exit')!].map((callback) => callback.call({})));
    return { ...module.exports, handlers, streamHandlers, errors, query, write, exit,
        state: () => ({ queries, writes, closed }) };
}

test('shutdown drains pending event writes, stops fallback polling, and does not start new Mongo operations', async () => {
    const f = await fixture();
    const broadcast = [...f.handlers.get('bus/broadcast')][0];
    const writing = broadcast('system/setting', [{}]);
    f.streamHandlers.get('error')!(new Error('not a replica set'));
    f.streamHandlers.get('error')!(new Error('duplicate error'));
    assert.equal(f.state().queries, 1, 'Only one fallback polling loop is allowed');
    let exited = false;
    const stopping = f.exit().then(() => { exited = true; });
    await Promise.resolve();
    assert.equal(exited, false);
    assert.equal(f.state().closed, true);
    await broadcast('system/setting', [{}]);
    assert.equal(f.state().writes, 1);
    f.query.resolve(null);
    f.write.reject(new Error('MongoExpiredSessionError during shutdown'));
    await Promise.all([stopping, writing]);
    assert.equal(exited, true);
    assert.equal(f.state().queries, 1);
    assert.equal(f.errors.length, 0);
});

test('normal Mongo write failures remain visible, without an unhandled promise rejection', async () => {
    const f = await fixture();
    const writing = [...f.handlers.get('bus/broadcast')][0]('system/setting', [{}]);
    const error = new Error('database unavailable');
    f.write.reject(error);
    await writing;
    assert.equal(f.errors[0], error);
    await f.exit();
});

test('consumer exit callbacks keep their instance and wait for running work before the database closes', async () => {
    const f = await fixture(false);
    const job = deferred();
    const started = deferred();
    const consumer = new f.Consumer({}, () => {
        started.resolve();
        return job.promise;
    });
    await started.promise;
    const manualStop = consumer.destroy();
    let exited = false;
    const stopping = f.exit().then(() => { exited = true; });
    await Promise.resolve();
    assert.equal(consumer.consuming, false);
    assert.equal(exited, false);
    job.resolve();
    await Promise.all([stopping, manualStop]);
    assert.equal(consumer.processing.size, 0);
    assert.equal(f.errors.length, 0);
});
