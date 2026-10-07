import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { normalizeHonorFrameImage } from '../src/lib/honor-frame-image.ts';

const require = createRequire(import.meta.url);
const id = new ObjectId('1234567890abcdef12345678');
function fixture() {
    const frame = { _id: id, name: 'Award', active: true, artworkVersion: 2, deleted: false, artworkRevision: undefined as string | undefined };
    const queries: any[] = [];
    const projections: any[] = [];
    const limits: number[] = [];
    const paths: string[] = [];
    const updates: any[] = [];
    const events: string[] = [];
    let removed = false;
    let storageFails = false;
    let writeFails = false;
    let databaseFails = false;
    let conflict = false;
    const stored: string[] = [];
    const uniqueness: any[][] = [];
    const image = new PNG({ width: 512, height: 512 });
    image.data.fill(0);
    image.data[3] = 255;
    const png = PNG.sync.write(image);
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
        'fs/promises': { readFile: async () => png },
        '../context': {}, '../error': { NotFoundError: Error, UserNotFoundError: Error, ValidationError: Error },
        '../lib/honor-frame-image': { normalizeHonorFrameImage, MAX_FRAME_BYTES: 2 * 1024 * 1024 }, '../lib/honor-frame-user': {},
        '../lib/honor-frame-catalog': {
            assertUniqueFrame: async (...args: any[]) => { uniqueness.push(args); },
            frameNameKey: (value: string) => value.toLowerCase(), frameDuplicateError: (error: any) => error,
            frameArtworkHash: () => 'new-hash', readArtwork: async (path: string) => { paths.push(path); return png; },
        },
        '../model/builtin': { PRIV: { PRIV_EDIT_SYSTEM: 1 } },
        '../model/honor-frame': {
            coll: {
                findOne: async (query: any) => removed || (query.deleted?.$ne && frame.deleted) ? null : { ...frame },
                countDocuments: async () => 13,
                find: (query: any) => { queries.push(query); return cursor; },
                updateOne: async (query: any, update: any) => {
                    if (databaseFails) throw new Error('Database unavailable');
                    if (conflict) return { matchedCount: 0 };
                    if (query.deleted?.$ne && frame.deleted) return { matchedCount: 0 };
                    events.push('frame');
                    updates.push(update);
                    Object.assign(frame, update.$set);
                    return { matchedCount: 1 };
                },
                deleteOne: async () => { events.push('remove'); removed = true; },
            },
            framePath: (value: string, shape?: string, revision?: string) => `${value}/${revision ? `${revision}/` : ''}${shape || 'legacy'}`,
            publicFrame: (doc: any) => ({ id: doc._id.toHexString(), name: doc.name, description: doc.description || '' }),
        },
        '../model/oplog': { log: async () => {} },
        '../model/storage': {
            put: async (path: string) => {
                stored.push(path);
                if (writeFails && stored.length % 2 === 0) throw new Error('Artwork write failed');
            },
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
        instance.user = { _id: 1, hasPriv: () => false };
        instance.request = { files: {} };
        instance.limitRate = async () => {};
        return instance;
    };
    return { handler, queries, projections, limits, paths, updates, frame, events, stored, uniqueness,
        setWriteFails: (value: boolean) => { writeFails = value; },
        setDatabaseFails: (value: boolean) => { databaseFails = value; },
        setConflict: (value: boolean) => { conflict = value; },
        setStorageFails: (value: boolean) => { storageFails = value; },
        setData: (value: any[]) => { data = value; }, setOwners: (value: boolean) => { hasOwners = value; } };
}

test('rename and status update only the intended field, avoiding stale card overwrites', async () => {
    const api = fixture();
    const handler = api.handler('ManageHonorFramesHandler');
    await handler.postRename('domain-a', id, ' Renamed ');
    await handler.postStatus('domain-b', id, false);
    assert.equal(JSON.stringify(api.updates), JSON.stringify([{ $set: { name: 'Renamed', nameKey: 'renamed' } }, { $set: { active: false } }]));
    await assert.rejects(handler.postRename('domain-a', id, ' '));
});

test('frame descriptions can be maintained by the admin and reach the owners page without changing publication', async () => {
    const api = fixture();
    const handler = api.handler('ManageHonorFramesHandler');
    await handler.postDescription('a', id, '  Awarded for completing the training.  ');
    const owners = api.handler('HonorFrameOwnersHandler');
    await owners.get('b', id);
    assert.equal(owners.response.body.frame.description, 'Awarded for completing the training.');
    assert.equal(api.frame.active, true);
    assert.equal(api.frame.name, 'Award');
    await assert.rejects(handler.postDescription('a', id, 'x'.repeat(2001)));
    assert.equal(api.updates.length, 1);
});

test('edit form loads the global frame and metadata edits preserve ownership, status and artwork', async () => {
    const api = fixture();
    const page = api.handler('UploadHonorFrameHandler');
    await page.get('another-domain', id);
    assert.equal(page.response.body.frame.name, 'Award');
    const handler = api.handler('ManageHonorFramesHandler');
    await handler.postEdit('another-domain', id, ' Renamed ', ' Updated description ');
    assert.equal(api.frame.name, 'Renamed');
    assert.equal((api.frame as any).description, 'Updated description');
    assert.equal(api.frame.active, true);
    assert.equal(api.frame._id, id);
    assert.equal(api.frame.artworkVersion, 2);
    assert.equal(api.stored.length, 0);
    assert.equal(api.queries.length, 0, 'ownership is not rewritten');
    assert.equal(api.uniqueness[0][2], id);
    await assert.rejects(handler.postEdit('a', id, '', ''));
    await assert.rejects(handler.postEdit('a', id, 'Name', 'x'.repeat(2001)));
});

test('replacing one shape stages a complete new pair and image and deletion routes use its revision', async () => {
    const api = fixture();
    const handler = api.handler('ManageHonorFramesHandler');
    handler.request.files = { square: { filepath: '/square.png', size: 1000 } };
    await handler.postEdit('a', id, 'Award', 'New artwork');
    const revision = api.frame.artworkRevision;
    assert.match(revision!, /^[a-f0-9]{24}$/);
    assert.deepEqual(api.stored, [`${id}/${revision}/square`, `${id}/${revision}/circle`]);
    assert.deepEqual(api.paths, [`${id}/circle`, `${id}/square`, `${id}/circle`]);
    assert.equal(api.uniqueness[0][1], 'new-hash');
    assert.equal(api.uniqueness[0][2], id);
    await api.handler('HonorFrameImageHandler').get('b', id, 'circle');
    assert.equal(api.paths.at(-1), `${id}/${revision}/circle`);
    await handler.postDelete('b', id);
    assert.deepEqual(api.paths.slice(-2), [`${id}/${revision}/square`, `${id}/${revision}/circle`]);
});

test('failed storage, database writes and concurrent edits clean only staged files and preserve the live frame', async () => {
    for (const failure of ['storage', 'database', 'concurrent']) {
        const api = fixture();
        const handler = api.handler('ManageHonorFramesHandler');
        handler.request.files = {
            square: { filepath: '/square.png', size: 1000 }, circle: { filepath: '/circle.png', size: 1000 },
        };
        if (failure === 'storage') api.setWriteFails(true);
        if (failure === 'database') api.setDatabaseFails(true);
        if (failure === 'concurrent') api.setConflict(true);
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(handler.postEdit('a', id, 'New name', 'New description'));
        assert.equal(api.frame.name, 'Award');
        assert.equal(api.frame.artworkRevision, undefined);
        assert.deepEqual(api.paths, api.stored);
        assert.ok(api.paths.every((path) => ![`${id}/square`, `${id}/circle`].includes(path)));
    }
});

test('oversized artwork is rejected before storage and deleted frames cannot be edited or loaded', async () => {
    const api = fixture();
    const handler = api.handler('ManageHonorFramesHandler');
    handler.request.files = { circle: { filepath: '/circle.png', size: 3 * 1024 * 1024 } };
    await assert.rejects(handler.postEdit('a', id, 'Award', ''));
    assert.equal(api.stored.length, 0);
    api.frame.deleted = true;
    await assert.rejects(handler.postEdit('a', id, 'Award', ''));
    await assert.rejects(api.handler('UploadHonorFrameHandler').get('a', id));
});

test('updated artwork URLs vary by revision and legacy frame storage paths remain compatible', () => {
    const module = { exports: {} as any };
    const source = readFileSync(new URL('../src/model/honor-frame.ts', import.meta.url), 'utf8');
    runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports,
        require: (name: string) => name === '../service/db' ? { collection: () => ({}) } : require(name),
    });
    const { publicFrame, framePath } = module.exports;
    const frame = { _id: id, name: 'Award', artworkVersion: 2 };
    const before = publicFrame(frame);
    const after = publicFrame({ ...frame, artworkRevision: 'revision1' });
    assert.equal(before.squareImageUrl, `/honor-frame/${id}/square.png`);
    for (const key of ['squareImageUrl', 'circleImageUrl', 'imageUrl']) assert.equal(after[key], `${before[key]}?v=revision1`);
    assert.equal(after.id, before.id);
    assert.equal(framePath(id.toHexString()), `honor-frame/${id}.png`);
    assert.equal(framePath(id.toHexString(), 'square'), `honor-frame/${id}-square.png`);
    assert.equal(framePath(id.toHexString(), 'square', 'revision1'), `honor-frame/${id}-revision1-square.png`);
});

test('legacy artwork can keep its old format for metadata edits, but replacement requires a complete pair', async () => {
    const api = fixture();
    delete (api.frame as any).artworkVersion;
    const handler = api.handler('ManageHonorFramesHandler');
    await handler.postEdit('a', id, 'Legacy', 'Description only');
    assert.equal(api.frame.artworkVersion, undefined);
    handler.request.files = { square: { filepath: '/square.png', size: 1000 } };
    await assert.rejects(handler.postEdit('a', id, 'Legacy', ''));
    assert.equal(api.stored.length, 0);
    handler.request.files.circle = { filepath: '/circle.png', size: 1000 };
    await handler.postEdit('a', id, 'Legacy', 'Updated pair');
    assert.equal(api.frame.artworkVersion, 2);
    assert.equal(api.paths.at(-1), `${id}/legacy`);
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
