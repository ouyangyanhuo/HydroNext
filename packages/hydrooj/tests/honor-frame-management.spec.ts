import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const id = new ObjectId('1234567890abcdef12345678');
function fixture() {
    const frame = { _id: id, name: 'Award', active: true, artworkVersion: 2, deleted: false };
    const queries: any[] = [];
    const projections: any[] = [];
    const limits: number[] = [];
    const paths: string[] = [];
    const updates: any[] = [];
    const events: string[] = [];
    let removed = false;
    let storageFails = false;
    let data: any[] = [{ _id: 2, uname: 'Student', avatar: '', honorFrameId: id.toHexString() }];
    let hasOwners = false;
    const cursor = {
        project: (value: any) => { projections.push(value); return cursor; },
        sort: () => cursor, skip: () => cursor,
        limit: (n: number) => { limits.push(n); return cursor; },
        toArray: async () => data,
    };
    const userColl = {
        find: (query: any) => { queries.push(query); return cursor; },
        findOne: async (query: any) => query.honorFrameIds
            ? hasOwners ? { _id: 2 } : null : { _id: 2, honorFrameIds: [id.toHexString()] },
        countDocuments: async () => 30,
        updateMany: async (query: any, update: any) => {
            events.push('users');
            queries.push(query);
            updates.push(update);
        },
    };
    const mocks = {
        '../context': {}, '../error': { NotFoundError: Error, UserNotFoundError: Error, ValidationError: Error },
        '../lib/honor-frame-image': {}, '../lib/honor-frame-user': {},
        '../model/builtin': { PRIV: { PRIV_EDIT_SYSTEM: 1 } },
        '../model/honor-frame': {
            coll: {
                findOne: async () => removed ? null : frame, countDocuments: async () => 13,
                find: (query: any) => { queries.push(query); return cursor; },
                updateOne: async (query: any, update: any) => {
                    if (query.deleted?.$ne && frame.deleted) return { matchedCount: 0 };
                    events.push('frame');
                    updates.push(update);
                    Object.assign(frame, update.$set);
                    return { matchedCount: 1 };
                },
                deleteOne: async () => { events.push('remove'); removed = true; },
            },
            framePath: (value: string, shape?: string) => `${value}/${shape || 'legacy'}`,
            publicFrame: (doc: any) => ({ id: doc._id.toHexString(), name: doc.name }),
        },
        '../model/oplog': { log: async () => {} },
        '../model/storage': {
            get: async (path: string) => { paths.push(path); return Buffer.from('png'); },
            del: async (values: string[]) => {
                events.push('storage');
                if (storageFails) throw new Error('Storage unavailable');
                paths.push(...values);
            },
        },
        '../model/user': { __esModule: true, default: { coll: userColl }, deleteUserCache() {} },
        '../service/server': { Handler: class {}, param: () => () => {}, Types: { Range: () => undefined } },
    };
    const code = transformSync(readFileSync(new URL('../src/handler/honor-frame.ts', import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    const module = { exports: {} as any };
    runInNewContext(code, { module, exports: module.exports, Buffer, require: (name: string) => mocks[name] ?? require(name) });
    const handler = (name: string) => {
        const instance = new module.exports[name]();
        instance.response = { addHeader() {} };
        instance.user = { hasPriv: () => false };
        return instance;
    };
    return { handler, queries, projections, limits, paths, updates, frame, events,
        setStorageFails: (value: boolean) => { storageFails = value; },
        setData: (value: any[]) => { data = value; }, setOwners: (value: boolean) => { hasOwners = value; } };
}

test('rename and status update only the intended field, avoiding stale card overwrites', async () => {
    const api = fixture();
    const handler = api.handler('ManageHonorFramesHandler');
    await handler.postRename('domain-a', id, ' Renamed ');
    await handler.postStatus('domain-b', id, false);
    assert.equal(JSON.stringify(api.updates), JSON.stringify([{ $set: { name: 'Renamed' } }, { $set: { active: false } }]));
    await assert.rejects(handler.postRename('domain-a', id, ' '));
});

test('frame search matches literal partial names and includes disabled frames with an explicit flag', async () => {
    const api = fixture();
    api.setData([{ _id: id, name: '冠军.*', active: false }, { _id: id, name: '冠军奖', active: true }]);
    const handler = api.handler('HonorFrameSearchHandler');
    await handler.get('another-domain', ' 冠军.* ', 'frames');
    assert.equal(api.queries[0].name.$regex, '冠军\\.\\*');
    assert.equal(api.queries[0].name.$options, 'i');
    assert.equal(api.queries[0].active, undefined);
    assert.equal(api.queries[0].deleted.$ne, true);
    assert.equal(api.limits[0], 50);
    assert.equal(handler.response.body.options[0].disabled, true);
    assert.equal(handler.response.body.options[1].disabled, false);
});

test('deletion blocks new awards, globally revokes ownership, removes both assets and is idempotent', async () => {
    const api = fixture();
    const handler = api.handler('ManageHonorFramesHandler');
    await handler.postDelete('domain-a', id);
    assert.deepEqual(api.events, ['frame', 'users', 'storage', 'remove']);
    assert.equal(api.frame.active, false);
    assert.equal(api.frame.deleted, true);
    assert.equal(api.queries[0].domainId, undefined);
    assert.equal(api.queries[0].$or[0].honorFrameIds, id.toHexString());
    assert.equal(api.queries[0].$or[1].honorFrameId, id.toHexString());
    assert.equal(api.updates[1][0].$set.honorFrameIds.$setDifference[1][0], id.toHexString());
    assert.equal(api.updates[1][0].$set.honorFrameId.$cond[0].$eq[1], id.toHexString());
    assert.deepEqual(api.paths, [`${id}/square`, `${id}/circle`]);
    await handler.postDelete('domain-b', id);
    assert.equal(api.events.length, 4);
    assert.equal(handler.response.body.ok, true);
});

test('failed deletion stays unpublished, cannot be restored by stale writes, and cleanup can be retried', async () => {
    const api = fixture();
    api.frame.artworkVersion = 1;
    api.setStorageFails(true);
    const handler = api.handler('ManageHonorFramesHandler');
    await assert.rejects(handler.postDelete('a', id), /Storage unavailable/);
    await assert.rejects(handler.postStatus('b', id, true));
    await assert.rejects(handler.postRename('b', id, 'Revived'));
    await assert.rejects(api.handler('HonorFrameImageHandler').get('a', id, 'circle'));
    api.setStorageFails(false);
    await handler.postDelete('a', id);
    assert.deepEqual(api.paths, [`${id}/legacy`]);
});

test('owner search is global, escaped, projected and paginated at 25', async () => {
    const api = fixture();
    const handler = api.handler('HonorFrameOwnersHandler');
    await handler.get('domain-a', id, 99, '.*');
    assert.equal(api.queries[0].honorFrameIds, id.toHexString());
    assert.equal(api.queries[0].$or[0].uname.$regex, '\\.\\*');
    assert.equal(api.queries[0].domainId, undefined);
    assert.equal(api.projections[0].mail, undefined);
    assert.equal(api.limits[0], 25);
    assert.equal(handler.response.body.page, 2);
    assert.equal(handler.response.body.owners[0].equipped, true);
    assert.equal(handler.response.body.owners[0].honorFrameId, undefined);
});

test('recipient search supports username and ID without returning account secrets', async () => {
    const api = fixture();
    const handler = api.handler('HonorFrameSearchHandler');
    await handler.get('domain-a', '2', 'users');
    assert.equal(api.queries[0].$and[1].$or[1]._id, 2);
    assert.equal(JSON.stringify(api.projections[0]), JSON.stringify({ _id: 1, uname: 1 }));
    assert.equal(api.limits[0], 50);
    assert.equal(handler.response.body.options[0].label, 'Student (#2)');
});

test('public collection contains owned active and retired frames, with a twelve-item limit', async () => {
    const api = fixture();
    api.setData([{ _id: id, name: 'Retired', active: false }]);
    const handler = api.handler('UserHonorFramesHandler');
    await handler.get('another-domain', 2, 99);
    assert.equal(api.queries[0].active, undefined);
    assert.equal(api.queries[0]._id.$in[0].toHexString(), id.toHexString());
    assert.equal(api.limits[0], 12);
    assert.equal(handler.response.body.page, 2);
    assert.equal(handler.response.body.frames[0].active, false);
});

test('image shape routing keeps legacy files, hides unawarded drafts, and allows public retired awards', async () => {
    const api = fixture();
    const handler = api.handler('HonorFrameImageHandler');
    await handler.get('a', id, 'circle');
    await handler.get('b', id, 'square');
    assert.deepEqual(api.paths, [`${id}/circle`, `${id}/square`]);
    api.frame.active = false;
    await assert.rejects(handler.get('a', id, 'circle'), new RegExp(id.toHexString()));
    api.setOwners(true);
    await handler.get('a', id, 'circle');
    delete (api.frame as any).artworkVersion;
    await handler.get('a', id, 'square');
    assert.equal(api.paths.at(-1), `${id}/legacy`);
});
