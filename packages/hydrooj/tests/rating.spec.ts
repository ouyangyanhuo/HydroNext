import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
function fixture() {
    const writes: any[] = [];
    const filters: any[] = [];
    const cacheClears: string[] = [];
    const collection = {
        initializeUnorderedBulkOp() {
            const operations: any[] = [];
            return { batches: operations, find(query: any) {
                const builder = {
                    upsert: () => builder,
                    update: (update: any) => operations.push({ query, update }),
                    updateOne: (update: any) => operations.push({ query, update }),
                };
                return builder;
            }, execute: async () => writes.push(...operations) };
        },
    };
    const empty = {
        project() { return this; },
        sort() { return this; },
        async *[Symbol.asyncIterator]() { /* No ranked users needed in this fixture. */ },
    };
    const security = { contestSecurityRankingFilter: (...args: any[]) => {
        filters.push(args);
        if (args[0]) throw new Error('Proctor service is unavailable.');
        return {};
    } };
    const mocks: Record<string, any> = {
        lodash: require('lodash'), mongodb: require('mongodb'), schemastery: require('schemastery'),
        '@hydrooj/utils': { Counter: () => new Proxy({}, { get: (self, key) => self[key] || 0 }) },
        '../lib/contest-security': security, '../lib/difficulty': { default: () => 5 }, '../lib/rating': {},
        '../model/builtin': { PRIV: { PRIV_USER_PROFILE: 1 }, STATUS: { STATUS_ACCEPTED: 1, STATUS_SYSTEM_ERROR: 8 } },
        '../model/contest': {
            getMulti: () => ({ limit: () => ({ toArray: async () => [{ proctorEnabled: true, allowTeam: true, duration: 2 }] }) }),
        },
        '../model/domain': { __esModule: true, default: {
            getMulti: () => ({ toArray: async () => [{ _id: 'blocked' }, { _id: 'ordinary' }] }),
            getMultiUserInDomain: () => empty,
            setMultiUserInDomain: async (...args: any[]) => writes.push(args),
        } },
        '../model/problem': {},
        '../model/user': { __esModule: true, default: { getById: async () => ({ hasPriv: () => true }) },
            deleteUserCache: (domainId: string) => cacheClears.push(domainId) },
        '../service/db': { __esModule: true, default: { collection: () => collection } },
    };
    const module = { exports: {} as any };
    runInNewContext(transformSync(readFileSync(new URL('../src/script/rating.ts', import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, { module, exports: module.exports, global: { Hydro: { model: {} } },
        require: (name: string) => {
            assert.ok(name in mocks, `Unexpected dependency: ${name}`);
            return mocks[name];
        } });
    return { api: module.exports, writes, filters, cacheClears };
}

test('RP calculator failure leaves the affected domain untouched and does not stop other domains', async () => {
    const { api, writes, cacheClears } = fixture();
    api.RpTypes.problem.run = async (_: any, result: any) => { result[7] = 10; };
    api.RpTypes.contest.run = async ([domainId]: string[]) => {
        if (domainId === 'blocked') throw new Error('Proctor service is unavailable.');
    };
    api.RpTypes.delta.run = async (_: any, result: any) => { result[7] = 2; };
    await assert.rejects(api.run({ domainId: 'blocked' }, async () => {}), /unavailable/);
    assert.equal(writes.length, 0);
    assert.equal(cacheClears.length, 0);
    const reports: any[] = [];
    await assert.rejects(api.run({}, async (report: any) => reports.push(report)), /RP calculation failed/);
    assert.ok(!writes.some((write) => write.query?.domainId === 'blocked' || write[0] === 'blocked'));
    const update = writes.find((write) => write.query?.uid === 7);
    assert.equal(update.query.domainId, 'ordinary');
    assert.deepEqual(JSON.parse(JSON.stringify(update.update)), { $set: { rpInfo: { problem: 10, delta: 2 }, rp: 12 } });
    const reset = writes.find((write) => write.query?.uid?.$nin);
    assert.deepEqual(Array.from(reset.query.uid.$nin), [7]);
    assert.ok(reports.some((report) => report.case?.status === 8));
    assert.ok(reports.some((report) => report.case?.message === 'Domain ordinary finished'));
    assert.deepEqual(cacheClears, ['ordinary']);
});

test('rated team contests pass duration and team policy to the mandatory security filter', async () => {
    const { api, filters, writes } = fixture();
    await assert.rejects(api.RpTypes.contest.run(['blocked'], {}, async () => {}), /unavailable/);
    assert.equal(filters.length, 1);
    assert.deepEqual(filters[0].slice(0, 3), [true, true, 2]);
    assert.equal(typeof filters[0][3], 'number');
    assert.equal(filters[0][4], true);
    assert.equal(writes.length, 0);
});
