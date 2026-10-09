import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const id = '1234567890abcdef12345678';
const errors = { PermissionError: Error, ValidationError: Error, ForbiddenError: Error, ContestNotLiveError: Error };
function load(path: string, mocks: Record<string, any>) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, URL,
        require: (name: string) => mocks[name] ?? (name.startsWith('../') ? {} : require(name)),
    });
    return module.exports;
}

test('publishes durable announcements before notifying deduplicated registered recipients', async () => {
    const calls: any[] = [];
    const model = load('../src/model/contest-announcement.ts', {
        '../error': errors,
        '../service/db': { __esModule: true, default: { collection: () => ({ insertOne: async (doc: any) => calls.push(doc) }) } },
        '../service/bus': { __esModule: true, default: { broadcast: (event: string, uids: number[]) => calls.push([event, uids]) } },
    });
    const payload = { domainId: 'exam', tid: new ObjectId(id), title: 'Contest', content: '  Notice  ', createdBy: 1, recipients: [2, 2, 3, 0, -1] };
    const result = await model.publish(payload);
    assert.equal(result.recipients, 2);
    assert.equal(calls[0].domainId, 'exam');
    assert.equal(calls[0].content, 'Notice');
    assert.equal(JSON.stringify(calls[0].recipients), '[2,3]');
    assert.equal(JSON.stringify(calls[1]), '["contest/announcement",[2,3]]');
    await assert.rejects(model.publish({ ...payload, content: ' ' }));
    await assert.rejects(model.publish({ ...payload, content: 'x'.repeat(4001) }));
    assert.equal(calls.length, 2);
});

test('pending inbox is UID-scoped, ordered, bounded and never exposes the recipient list', async () => {
    let pipeline: any[] = [];
    const model = load('../src/model/contest-announcement.ts', {
        '../error': errors,
        '../service/db': { __esModule: true, default: { collection: (name: string) => name.endsWith('.receipt')
            ? { collectionName: 'custom.receipts' }
            : { aggregate: (value: any[]) => { pipeline = value; return { toArray: async () => [] }; } } } },
    });
    await model.pending(7);
    assert.equal(pipeline[0].$match.recipients, 7);
    assert.equal(pipeline[1].$sort._id, 1);
    assert.equal(pipeline[2].$lookup.from, 'custom.receipts');
    assert.equal(pipeline[2].$lookup.pipeline[0].$match.uid, 7);
    assert.equal(pipeline[3].$match['receipt.0'].$exists, false);
    assert.equal(pipeline[4].$limit, 20);
    assert.equal(pipeline[5].$project.recipients, 0);
});

test('acknowledgements cannot target another user and are safe across simultaneous tabs', async () => {
    const writes: any[] = [];
    let allowed = false;
    let duplicate = false;
    const model = load('../src/model/contest-announcement.ts', {
        '../error': errors,
        '../service/bus': { __esModule: true, default: { broadcast() {} } },
        '../service/db': { __esModule: true, default: { collection: (name: string) => name.endsWith('.receipt')
            ? { updateOne: async (...args: any[]) => {
                writes.push(args);
                if (duplicate) throw Object.assign(new Error(), { code: 11000 });
            } }
            : { findOne: async (query: any) => query.recipients === 7 && allowed ? { _id: query._id } : null } } },
    });
    await assert.rejects(model.acknowledge(7, 'invalid'));
    await assert.rejects(model.acknowledge(7, id));
    assert.equal(writes.length, 0);
    allowed = true;
    await model.acknowledge(7, id);
    assert.equal(writes[0][0].uid, 7);
    assert.equal(writes[0][0].announcementId.toHexString(), id);
    assert.equal(writes[0][2].upsert, true);
    duplicate = true;
    await model.acknowledge(7, id);
    await assert.rejects(model.acknowledge(8, id));
});

test('publishing requires contest administration, an ongoing contest and the current domain registration', async () => {
    let allowed = false;
    let ongoing = true;
    const requests: any[] = [];
    const module = load('../src/handler/contest.ts', {
        '../context': { Service: class {} }, '../error': errors,
        '../service/server': { Handler: class {}, param: () => () => {}, post: () => () => {}, Types: { Range: () => [], ArrayOf: () => [] } },
        '@hydrooj/utils/lib/utils': {}, '../model/builtin': { PERM: { PERM_EDIT_CONTEST: 123 }, PRIV: {}, STATUS: {} },
        '../model/contest': {
            isOngoing: () => ongoing,
            getMultiStatus: (domainId: string, query: any) => {
                requests.push([domainId, query]);
                return { project: () => ({ toArray: async () => [{ uid: 2 }, { uid: 3 }] }) };
            },
        },
        '../model/contest-announcement': { publish: async (payload: any) => { requests.push(payload); return { recipients: 2 }; } },
        '../model/oplog': { log: async () => {} },
    });
    const handler = Object.assign(Object.create(module.ContestManagementHandler.prototype), {
        user: { _id: 1 }, domain: { _id: 'exam' }, tdoc: { title: 'Scoped contest' }, response: {},
        checkPerm: (perm: number) => { assert.equal(perm, 123); if (!allowed) throw new Error('Denied'); },
        limitRate: async () => {},
    });
    await assert.rejects(handler.postAnnouncement('exam', new ObjectId(id), 'Notice'), /Denied/);
    allowed = true;
    await assert.rejects(handler.postAnnouncement('other', new ObjectId(id), 'Wrong domain'));
    ongoing = false;
    await assert.rejects(handler.postAnnouncement('exam', new ObjectId(id), 'Notice'));
    ongoing = true;
    await assert.rejects(handler.postAnnouncement('exam', new ObjectId(id), ' '));
    assert.equal(requests.length, 0);
    await handler.postAnnouncement('exam', new ObjectId(id), 'Notice');
    assert.equal(requests[0][0], 'exam');
    assert.equal(requests[0][1].attend, 1);
    assert.equal(requests[0][1].docId.toHexString(), id);
    assert.equal(requests[1].domainId, 'exam');
    assert.equal(JSON.stringify(requests[1].recipients), '[2,3]');
});

test('global connections authenticate, filter live recipients, recover pending alerts and serialize acknowledgements', async () => {
    const calls: string[] = [];
    const sent: any[] = [];
    let acknowledged = false;
    const module = load('../src/handler/contest-announcement.ts', {
        '../error': errors, '../model/builtin': { PRIV: { PRIV_USER_PROFILE: 1 } },
        '../service/server': { ConnectionHandler: class {} },
        '../model/contest-announcement': {
            pending: async (uid: number) => { calls.push(`pending:${uid}`); return acknowledged ? [] : [{ _id: id }]; },
            acknowledge: async (uid: number, value: string) => { calls.push(`ack:${uid}:${value}`); acknowledged = true; },
        },
    });
    const handler = new module.ContestAnnouncementConnectionHandler();
    Object.assign(handler, {
        user: { _id: 7 }, context: {}, request: { headers: { origin: 'https://oj.example' }, host: 'oj.example' },
        checkPriv: () => {}, ctx: { on: () => {} }, send: (data: any) => sent.push(data), limitRate: async () => {},
    });
    await handler.prepare();
    assert.equal(sent[0].announcements[0]._id, id);
    await handler.announcement([8]);
    assert.equal(sent.length, 1);
    await Promise.all([handler.message({ operation: 'acknowledge', id }), handler.announcement([7])]);
    assert.equal(calls.at(-2), `ack:7:${id}`);
    assert.equal(sent.at(-1).announcements.length, 0);
    await handler.announcement([7]);
    assert.equal(sent.at(-1).announcements.length, 0);
    await handler.cleanup();
    await handler.announcement([7]);
    assert.equal(sent.length, 4);
    handler.request.headers.origin = 'https://evil.example';
    await assert.rejects(handler.prepare());
    handler.checkPriv = () => { throw new Error('Login required'); };
    await assert.rejects(handler.prepare(), /Login required/);
});
