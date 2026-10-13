import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import * as order from '../src/lib/training-category-order.ts';

const require = createRequire(import.meta.url);
const categories = () => [
    { _id: 'a', name: 'First', tids: ['training-a'] },
    { _id: 'b', name: 'Second', tids: ['training-b'] },
    { _id: 'c', name: 'Third', tids: [] },
];
const plain = (value: any) => JSON.parse(JSON.stringify(value));

function fixture(options: any = {}) {
    let ddoc: any = { _id: 'team', lower: 'team', _trainingCategories: categories(), ...options.doc };
    const calls: any[] = [];
    const routes = new Map<string, any>();
    const cursor = { sort: () => cursor, project: () => cursor, limit: () => cursor, toArray: async () => [] };
    class Handler {
        response: any = {};
        user = { _id: 1, hasPerm: () => !options.denied, hasPriv: () => false };
        ctx = { parallel: async () => undefined };
        checkPerm(permission: number) { if (options.denied || permission !== 1) throw new Error('denied'); }
        async paginate() { return [[], 1]; }
    }
    const mocks: any = {
        '../lib/training-category-order': order,
        '../lib/list-sort': { LIST_SORT_MODES: ['default'], TRAINING_LIST_SORT: { default: {} } },
        '../service/server': { Handler, param: () => () => {}, post: () => () => {}, Types: { Range: () => [], ArrayOf: () => [] } },
        '../error': { ValidationError: class extends Error { constructor(_: any, __: any, message: string) { super(message); } } },
        '../model/builtin': { PERM: { PERM_CREATE_TRAINING: 1 }, PRIV: {} },
        '../model/oplog': { log: async (...args: any[]) => calls.push(['audit', ...args.slice(1)]) },
        '../model/domain': { __esModule: true, default: {
            get: async (id: string) => { calls.push(['get', id]); return ddoc; },
            edit: async (id: string, changes: any, expected: any) => {
                calls.push(['edit', id, changes, expected]);
                if (options.concurrent) return null;
                ddoc = { ...ddoc, ...changes };
                return ddoc;
            },
        } },
        '../model/training': { getMulti: () => cursor },
        '@hydrooj/utils/lib/utils': {},
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/handler/training.ts', import.meta.url), 'utf8'),
        { loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    runInNewContext(code, { module, exports: module.exports,
        require: (name: string) => mocks[name] || (name.startsWith('../') ? {} : require(name)) });
    module.exports.apply({ Route: (name: string, _: string, type: any) => routes.set(name, type) });
    return { handler: new (routes.get('training_main'))(), calls, doc: () => ddoc };
}

test('order preserves category data, appends new categories and ignores deleted or repeated order entries', () => {
    const original = categories();
    const sorted = order.orderTrainingCategories(original, ['c', 'missing', 'a', 'c']);
    assert.deepEqual(sorted.map((item) => item._id), ['c', 'a', 'b']);
    assert.equal(sorted[0], original[2]);
    assert.deepEqual(original, categories());
    assert.deepEqual(order.orderTrainingCategories(original, undefined), original);
});

test('validation requires a complete permutation and an unchanged previous order', () => {
    order.validateTrainingCategoryOrder(categories(), ['c', 'a', 'b'], ['b', 'a', 'c'], ['c', 'a', 'b']);
    for (const ids of [['a', 'b'], ['a', 'b', 'b'], ['a', 'b', 'foreign']]) {
        assert.throws(() => order.validateTrainingCategoryOrder(categories(), [], ids, ['a', 'b', 'c']), /Invalid/);
    }
    assert.throws(() => order.validateTrainingCategoryOrder(categories(), ['b', 'a', 'c'], ['a', 'c', 'b'], ['a', 'b', 'c']), /changed/);
    assert.throws(() => order.validateTrainingCategoryOrder(categories(), [], ['a', 'b', 'c'], ['a', 'b']), /changed/);
});

test('sort writes domain-specific order metadata only and GET returns the saved order to all users', async () => {
    const f = fixture();
    await f.handler.postSortCategory('team', ['c', 'a', 'b'], ['a', 'b', 'c']);
    const write = f.calls.find(([kind]) => kind === 'edit');
    assert.equal(write[1], 'team');
    assert.deepEqual(plain(write[2]), { _trainingCategoryOrder: ['c', 'a', 'b'] });
    assert.deepEqual(plain(write[3]._trainingCategories), categories());
    assert.deepEqual(plain(write[3]._trainingCategoryOrder), { $exists: false });
    assert.deepEqual(plain(f.doc()._trainingCategories), categories());
    assert.equal(f.handler.response.body.ok, true);
    await f.handler.get('team');
    assert.deepEqual(plain(f.handler.response.body.categories.map((item: any) => item._id)), ['c', 'a', 'b']);
    const ordinary = fixture({ denied: true, doc: { _trainingCategoryOrder: ['c', 'a', 'b'] } });
    await ordinary.handler.get('team');
    assert.deepEqual(plain(ordinary.handler.response.body.categories.map((item: any) => item._id)), ['c', 'a', 'b']);
});

test('unauthorized, cross-domain IDs, incomplete lists and stale/concurrent updates cannot be saved', async () => {
    const denied = fixture({ denied: true });
    await assert.rejects(denied.handler.postSortCategory('team', ['c', 'a', 'b'], ['a', 'b', 'c']), /denied/);
    assert.equal(denied.calls.length, 0);
    for (const ids of [['a', 'foreign', 'c'], ['a', 'b'], ['a', 'a', 'b']]) {
        const f = fixture();
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(f.handler.postSortCategory('team', ids, ['a', 'b', 'c']), /Invalid/);
        assert.ok(!f.calls.some(([kind]) => kind === 'edit'));
    }
    const stale = fixture({ doc: { _trainingCategoryOrder: ['b', 'a', 'c'] } });
    await assert.rejects(stale.handler.postSortCategory('team', ['c', 'a', 'b'], ['a', 'b', 'c']), /changed/);
    const concurrent = fixture({ concurrent: true });
    await assert.rejects(concurrent.handler.postSortCategory('team', ['c', 'a', 'b'], ['a', 'b', 'c']), /changed/);
    assert.ok(!concurrent.calls.some(([kind]) => kind === 'audit'));
    assert.deepEqual(concurrent.doc()._trainingCategories, categories());
});

test('domain conditional edit cannot target another domain and only invalidates caches after a successful update', async () => {
    const calls: any[] = [];
    let result: any = { lower: 'exam' };
    const mocks: any = {
        '../service/db': { __esModule: true, default: { collection: () => ({ findOneAndUpdate: async (...args: any[]) => {
            calls.push(['write', ...args]);
            return result;
        } }) } },
        '../service/bus': { __esModule: true, default: {
            parallel: async (...args: any[]) => calls.push(['event', ...args]),
            broadcast: (...args: any[]) => calls.push(['broadcast', ...args]),
        } },
        '../utils': { ArgMethod: (_: any, __: any, descriptor: any) => descriptor },
        './builtin': {}, './user': {},
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/model/domain.ts', import.meta.url), 'utf8'),
        { loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    runInNewContext(code, { module, exports: module.exports, global: { Hydro: { model: {} } },
        require: (name: string) => mocks[name] || (name.startsWith('.') ? {} : require(name)) });
    await module.exports.default.edit('EXAM', { _trainingCategoryOrder: ['b', 'a'] }, { lower: 'foreign', _trainingCategoryOrder: ['a', 'b'] });
    assert.deepEqual(plain(calls.find(([kind]) => kind === 'write')[1]), { lower: 'exam', _trainingCategoryOrder: ['a', 'b'] });
    assert.ok(calls.some(([kind, event, id]) => kind === 'broadcast' && event === 'domain/delete-cache' && id === 'exam'));
    calls.length = 0;
    result = null;
    assert.equal(await module.exports.default.edit('exam', {}, { _trainingCategoryOrder: ['stale'] }), null);
    assert.ok(!calls.some(([kind]) => kind === 'broadcast'));
    assert.ok(!calls.some(([kind, event]) => kind === 'event' && event === 'domain/update'));
    calls.length = 0;
    result = { lower: 'exam' };
    await module.exports.default.edit('EXAM', { name: 'Legacy caller' });
    assert.deepEqual(plain(calls.find(([kind]) => kind === 'write')[1]), { lower: 'exam' });
});
