/* eslint-disable no-await-in-loop -- Sequentially exercise shared fixture state. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';

const source = transformSync(readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;

async function fixture(options: any = {}) {
    const hooks = new Map<string, any>();
    const records: any[] = [];
    const tid = new ObjectId();
    const tdoc = { docId: tid, domainId: 'test', beginAt: new Date(Date.now() + 60000), rule: 'ioi',
        objectiveOnce: true, ...options.contest };
    const mocks = {
        ForbiddenError: Error, ValidationError: Error,
        ContestModel: {
            get: async () => tdoc,
            getTeamVid: async () => options.team ?? null,
            getRecordContestUid: async (record: any) => record.contestUid ?? record.uid,
        },
        ProblemModel: { get: async () => ({ config: { type: options.type || 'objective' } }) },
        RecordModel: {
            RECORD_PRETEST: new ObjectId('000000000000000000000000'),
            RECORD_GENERATE: new ObjectId('000000000000000000000001'),
            coll: {
                createIndex: async () => { if (options.indexFailure) throw new Error('index unavailable'); },
                findOne: async ({ objectiveOnceKey }: any) => records.find((record) => record.objectiveOnceKey === objectiveOnceKey),
            },
            getMulti: () => ({ sort: () => records.filter((record) => !record.objectiveOnceKey) }),
        },
    };
    const module = { exports: {} as any };
    runInNewContext(source, { module, exports: module.exports, Date, require: () => mocks });
    const initialize = () => module.exports.apply({ on: (name: string, callback: any) => hooks.set(name, callback) });
    if (options.indexFailure) return { initialize, hooks };
    await initialize();
    const record = { _id: new ObjectId(), domainId: 'test', contest: tid, pid: 1, uid: 7, code: '1: A' };
    return { hooks, records, record, tdoc, mocks };
}

test('the policy applies only to objective contest submissions and uses participant/team identity', async () => {
    for (const options of [{ contest: { objectiveOnce: false } }, { contest: { rule: 'homework' } }, { type: 'default' }]) {
        const f = await fixture(options);
        await f.hooks.get('record/before-add')(f.record);
        assert.equal((f.record as any).objectiveOnceKey, undefined);
    }
    const f = await fixture({ team: -10, contest: { allowTeam: true } });
    for (const contest of [undefined, f.mocks.RecordModel.RECORD_PRETEST, f.mocks.RecordModel.RECORD_GENERATE]) {
        const record = { ...f.record, contest };
        await f.hooks.get('record/before-add')(record);
        assert.equal(record.objectiveOnceKey, undefined);
    }
    await f.hooks.get('record/before-add')(f.record);
    assert.deepEqual(JSON.parse((f.record as any).objectiveOnceKey), ['test', String(f.tdoc.docId), 1, -10]);
    f.records.push({ ...f.record });
    await assert.rejects(f.hooks.get('record/before-add')({ ...f.record, uid: 8 }), /only be submitted once/);
});

test('unmarked historical records count; only this addon unique-key collisions become policy errors', async () => {
    const f = await fixture();
    f.records.push({ ...f.record });
    await assert.rejects(f.hooks.get('record/before-add')({ ...f.record }), /only be submitted once/);
    f.records.length = 0;
    await f.hooks.get('record/before-add')(f.record);
    const error = { code: 11000, keyPattern: { objectiveOnceKey: 1 } };
    assert.throws(() => f.hooks.get('record/insert-error')(f.record, error), /only be submitted once/);
    assert.doesNotThrow(() => f.hooks.get('record/insert-error')(f.record, { code: 11000, keyPattern: { _id: 1 } }));
    assert.doesNotThrow(() => f.hooks.get('record/insert-error')(f.record, { code: 123 }));
});

test('settings validate booleans, preserve absent values and freeze policy after the start', async () => {
    const f = await fixture();
    const settings = {} as any;
    await f.hooks.get('contest/edit-settings')({ tdoc: f.tdoc, args: {} }, settings);
    assert.equal(settings.objectiveOnce, true);
    await f.hooks.get('contest/edit-settings')({ tdoc: f.tdoc, args: { objectiveOnce: 'false' } }, settings);
    assert.equal(settings.objectiveOnce, false);
    assert.throws(() => f.hooks.get('contest/edit-settings')({ args: { objectiveOnce: 'bad' } }, {}), /objectiveOnce/);
    f.tdoc.beginAt = new Date(Date.now() - 1);
    assert.throws(() => f.hooks.get('contest/before-edit')(f.tdoc, { objectiveOnce: false }), /cannot change/);
    assert.throws(() => f.hooks.get('contest/edit-settings')({ tdoc: f.tdoc, args: { objectiveOnce: false } }, {}), /cannot change/);
    assert.doesNotThrow(() => f.hooks.get('contest/before-edit')(f.tdoc, { objectiveOnce: true }));
});

test('page status restores the actual answer sheet without disclosing judging data', async () => {
    const f = await fixture();
    f.records.push({ ...f.record, score: 100, testCases: ['secret'] });
    const handler = { tdoc: f.tdoc, pdoc: { docId: 1, config: { type: 'objective' } }, user: { _id: 7 }, response: { body: {} as any } };
    await f.hooks.get('handler/after/ProblemDetail#get')(handler);
    assert.equal(handler.response.body.objectiveSubmission.submitted, true);
    assert.equal(handler.response.body.objectiveSubmission.answers, '1: A');
    assert.equal(handler.response.body.objectiveSubmission.score, undefined);
    assert.equal(handler.response.body.objectiveSubmission.testCases, undefined);
});

test('no enforcement hooks are registered if the unique index cannot be created', async () => {
    const f = await fixture({ indexFailure: true });
    await assert.rejects(f.initialize(), /index unavailable/);
    assert.equal(f.hooks.size, 0);
});
