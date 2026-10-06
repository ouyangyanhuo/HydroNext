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
const id = '1234567890abcdef12345678';
const otherId = 'abcdef1234567890abcdef12';
function load(path: string, mocks: Record<string, any>) {
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    const module = { exports: {} as any };
    runInNewContext(code, {
        module, exports: module.exports, Buffer, global: { Hydro: { model: {} } },
        require: (name: string) => mocks[name] ?? require(name),
    });
    return module.exports;
}

function png(width = 64, height = width, alpha = 0) {
    const image = new PNG({ width, height });
    image.data.fill(alpha);
    // One visible pixel ensures a useful, nonempty decoration.
    image.data[3] = 255;
    return PNG.sync.write(image);
}

test('paired artwork uses fixed geometry and protects the transparent avatar opening', () => {
    for (const shape of ['circle', 'square'] as const) {
        assert.equal(PNG.sync.read(normalizeHonorFrameImage(png(512), shape)).width, 512);
        assert.throws(() => normalizeHonorFrameImage(png(256), shape), /512/);
        const blocked = PNG.sync.read(png(512));
        blocked.data[(256 * 512 + 256) * 4 + 3] = 255;
        assert.throws(() => normalizeHonorFrameImage(PNG.sync.write(blocked), shape), /transparent/);
    }
    const corner = PNG.sync.read(png(512));
    corner.data[(80 * 512 + 80) * 4 + 3] = 255;
    assert.doesNotThrow(() => normalizeHonorFrameImage(PNG.sync.write(corner), 'circle'));
    assert.doesNotThrow(() => normalizeHonorFrameImage(PNG.sync.write(corner), 'square'));
    const interior = PNG.sync.read(png(512));
    interior.data[(80 * 512 + 200) * 4 + 3] = 255;
    assert.throws(() => normalizeHonorFrameImage(PNG.sync.write(interior), 'square'), /transparent/);
});

test('bulk ownership operations are bounded, global, conditional and leave other equipped frames alone', async () => {
    const writes: any[] = [];
    let count = 2;
    let active = true;
    let invalidations = 0;
    const module = load('../src/lib/honor-frame-user.ts', {
        '../error': { ValidationError: Error },
        '../model/honor-frame': { coll: { findOne: async () => ({ active }) } },
        '../model/user': { __esModule: true, default: { coll: {
            countDocuments: async () => count,
            updateMany: async (query: any, update: any) => { writes.push([query, update]); return { matchedCount: count }; },
        } }, deleteUserCache: () => invalidations++ },
    });
    await Promise.all([[], [0], [-1], [1.1], Array.from({ length: 51 }, (_, i) => i + 1)]
        .map((invalid) => assert.rejects(module.manageHonorFrameOwners(id, invalid, 'equip'))));
    assert.equal(writes.length, 0);
    await module.manageHonorFrameOwners(id, [1, 2, 2], 'grant');
    assert.equal(JSON.stringify(writes[0][0]), JSON.stringify({ _id: { $in: [1, 2] } }));
    await module.manageHonorFrameOwners(id, [1, 2], 'equip');
    assert.equal(writes[1][0].honorFrameIds, id);
    assert.equal(writes[1][1].$set.honorFrameId, id);
    await module.manageHonorFrameOwners(id, [1, 2], 'unequip');
    assert.equal(writes[2][1][0].$set.honorFrameIds, undefined);
    assert.equal(JSON.stringify(writes[2][1][0].$set.honorFrameId.$cond[0]), JSON.stringify({ $eq: ['$honorFrameId', id] }));
    await module.manageHonorFrameOwners(id, [1, 2], 'revoke');
    assert.ok(writes[3][1][0].$set.honorFrameIds.$setDifference);
    active = false;
    await assert.rejects(module.manageHonorFrameOwners(id, [1, 2], 'equip'));
    await assert.rejects(module.manageHonorFrameOwners(id, [1, 2], 'grant'));
    count = 1;
    await assert.rejects(module.manageHonorFrameOwners(id, [1, 2], 'revoke'));
    assert.equal(writes.length, 4);
    assert.equal(invalidations, 4);
});

test('frame artwork is decoded, normalized and checked for transparency', () => {
    const output = normalizeHonorFrameImage(png());
    const image = PNG.sync.read(output);
    assert.equal(image.width, 64);
    assert.equal(image.height, 64);
    assert.equal(image.data[7], 0);
    assert.throws(() => normalizeHonorFrameImage(png(64, 64, 255)), /transparent/);
    const empty = new PNG({ width: 64, height: 64 });
    empty.data.fill(0);
    assert.throws(() => normalizeHonorFrameImage(PNG.sync.write(empty)), /visible/);
});

test('spoofed, corrupt, oversized, nonsquare and decompression-bomb artwork is rejected', () => {
    for (const input of [Buffer.from('<svg onload="alert(1)"/>'), Buffer.alloc(2 * 1024 * 1024 + 1), png(32), png(64, 128)]) {
        assert.throws(() => normalizeHonorFrameImage(input));
    }
    const corrupt = png();
    corrupt[29] ^= 255;
    assert.throws(() => normalizeHonorFrameImage(corrupt));
    const bomb = png();
    bomb.writeUInt32BE(100000, 16);
    bomb.writeUInt32BE(100000, 20);
    assert.throws(() => normalizeHonorFrameImage(bomb), /dimensions/);
    const interlaced = png();
    interlaced[28] = 1;
    assert.throws(() => normalizeHonorFrameImage(interlaced), /Interlaced/);
    const duplicate = png();
    assert.throws(() => normalizeHonorFrameImage(Buffer.concat([
        duplicate.subarray(0, 33), duplicate.subarray(8, 33), duplicate.subarray(33),
    ])), /Duplicate/);
});

function fixture() {
    let active = true;
    const doc = { _id: 42, honorFrameIds: [] as string[], honorFrameId: '' };
    let invalidations = 0;
    const frames = { findOne: async (query: any) => (active && query._id.toHexString() === id ? { _id: new ObjectId(id), active } : null) };
    const coll = {
        findOneAndUpdate: async (query: any, update: any) => {
            assert.ok(!('domainId' in query));
            if (query._id !== doc._id || (query.honorFrameIds && !doc.honorFrameIds.includes(query.honorFrameIds))) return null;
            if (Array.isArray(update)) {
                assert.ok(update[0].$set.honorFrameIds.$setDifference);
                assert.ok(update[0].$set.honorFrameId.$cond);
                const revoked = update[0].$set.honorFrameIds.$setDifference[1][0];
                doc.honorFrameIds = doc.honorFrameIds.filter((value) => value !== revoked);
                if (doc.honorFrameId === revoked) doc.honorFrameId = '';
            } else if (update.$addToSet) {
                doc.honorFrameIds = [...new Set([...doc.honorFrameIds, update.$addToSet.honorFrameIds])];
            } else Object.assign(doc, update.$set);
            return doc;
        },
    };
    const operations = load('../src/lib/honor-frame-user.ts', {
        '../error': { UserNotFoundError: Error, ValidationError: Error },
        '../model/honor-frame': { coll: frames },
        '../model/user': { __esModule: true, default: { coll }, deleteUserCache: () => invalidations++ },
    });
    return { ...operations, doc, frames, disable: () => { active = false; }, invalidations: () => invalidations };
}

test('awards are idempotent and only active, existing frames can be equipped', async () => {
    const api = fixture();
    await assert.rejects(api.equipHonorFrame(42, id));
    await api.grantHonorFrame(42, id);
    await api.grantHonorFrame(42, id);
    assert.deepEqual(api.doc.honorFrameIds, [id]);
    await api.equipHonorFrame(42, id);
    assert.equal(api.doc.honorFrameId, id);
    await assert.rejects(api.equipHonorFrame(42, otherId));
    await assert.rejects(api.equipHonorFrame(42, 'https://example.org/frame.png'));
    await assert.rejects(api.grantHonorFrame(99, id));
    api.disable();
    await assert.rejects(api.equipHonorFrame(42, id));
    await assert.rejects(api.grantHonorFrame(42, id));
    await api.equipHonorFrame(42, '');
    assert.equal(api.doc.honorFrameId, '');
    assert.equal(api.invalidations(), 4);
});

test('revocation and equipping cannot race to restore a revoked frame', async () => {
    const api = fixture();
    await api.grantHonorFrame(42, id);
    let release!: (value: any) => void;
    api.frames.findOne = () => new Promise((resolve) => { release = resolve; });
    const equipping = api.equipHonorFrame(42, id);
    await api.revokeHonorFrame(42, id);
    release({ _id: new ObjectId(id), active: true });
    await assert.rejects(equipping);
    assert.deepEqual(api.doc.honorFrameIds, []);
    assert.equal(api.doc.honorFrameId, '');
    const reverse = fixture();
    await reverse.grantHonorFrame(42, id);
    await reverse.equipHonorFrame(42, id);
    await reverse.revokeHonorFrame(42, id);
    assert.equal(reverse.doc.honorFrameId, '');
});

test('revoking a different award does not remove the current frame', async () => {
    const api = fixture();
    await api.grantHonorFrame(42, id);
    await api.equipHonorFrame(42, id);
    await api.revokeHonorFrame(42, otherId);
    assert.equal(api.doc.honorFrameId, id);
});

test('user serialization and list rendering use global frames despite conflicting domain data', async () => {
    const frame = { id, name: 'Champion', imageUrl: `/honor-frame/${id}.png` };
    const doc = { _id: 42, uname: 'Ada', mail: 'a@example.org', honorFrameId: id };
    const broadcasts: any[] = [];
    const cursor = (data: any[]) => ({ project: () => ({ toArray: async () => structuredClone(data) }), toArray: async () => structuredClone(data) });
    const module = load('../src/model/user.ts', {
        '../error': {}, '../lib/avatar': {}, '../lib/hash.hydro': {}, './token': {},
        '../service/bus': { on() {}, parallel: async () => {}, broadcast: (...values: any[]) => broadcasts.push(values) },
        '../service/db': { collection: (name: string) => ({ find: () => cursor(name === 'user' ? [doc] : []) }) },
        '../utils': { ArgMethod: () => {}, buildProjection: () => ({}) },
        './builtin': { PERM: { PERM_ALL: 0n, PERM_VIEW_USER_PRIVATE_INFO: 1n }, PRIV: {} },
        './domain': {
            getDomainUserMulti: () => cursor([{ uid: 42, displayName: 'Domain alias', honorFrameId: otherId, honorFrame: { id: otherId } }]),
        },
        './setting': { SETTINGS_BY_KEY: {}, DOMAIN_USER_SETTINGS_BY_KEY: {} },
        './system': { get: () => undefined },
        './honor-frame': { resolveFrames: async (ids: string[]) => (ids.includes(id) ? { [id]: frame } : {}) },
    });
    await Promise.all(['a', 'b'].map(async (domainId) => {
        const instance = await new module.User(doc, { domainId, honorFrameId: otherId }).init();
        assert.equal(instance.serialize().honorFrame.id, id);
    }));
    module.default.getById = async () => new module.User(module.default.defaultUser, {});
    const list = await module.default.getListForRender('b', [42], false);
    assert.equal(list[42].honorFrame.id, id);
    assert.equal(list[42].displayName, 'Domain alias');
    assert.equal(list[42].honorFrameId, undefined);
    assert.equal(list[42].honorFrameIds, undefined);
    module.default.cache.set('id/42/a', {});
    module.deleteUserCache(true);
    assert.equal(module.default.cache.size, 0);
    assert.equal(broadcasts.at(-1)[1], 'true');
});

test('management requires global privilege, images hide unpublished frames, and equip uses the session user', async () => {
    const routes: any[] = [];
    const calls: any[] = [];
    const module = load('../src/handler/honor-frame.ts', {
        '../context': {}, '../error': { NotFoundError: Error, UserNotFoundError: Error, ValidationError: Error },
        '../lib/honor-frame-image': {},
        '../lib/honor-frame-user': { equipHonorFrame: async (...values: any[]) => calls.push(values) },
        '../model/builtin': { PRIV: { PRIV_EDIT_SYSTEM: 1, PRIV_USER_PROFILE: 2 } },
        '../model/honor-frame': { coll: { findOne: async () => ({ active: false }) } },
        '../model/oplog': {}, '../model/storage': {},
        '../model/user': { __esModule: true, default: { getById: async () => ({ honorFrame: null }) } },
        '../service/server': { Handler: class {}, param: () => () => {}, Types: { Range: () => undefined } },
    });
    await module.apply({ Route: (...route: any[]) => routes.push(route) });
    assert.equal(routes.find((route) => route[0] === 'manage_honor_frames')[3], 1);
    for (const name of ['manage_honor_frame_upload', 'manage_honor_frame_search', 'manage_honor_frame_owners']) {
        assert.equal(routes.find((route) => route[0] === name)[3], 1);
    }
    const admin = new module.ManageHonorFramesHandler();
    admin.checkPriv = (priv: number) => {
        assert.equal(priv, 1);
        throw new Error('denied');
    };
    await assert.rejects(admin.prepare(), /denied/);
    await Promise.all(['UploadHonorFrameHandler', 'HonorFrameSearchHandler', 'HonorFrameOwnersHandler'].map(async (name) => {
        const handler = new module[name]();
        handler.checkPriv = admin.checkPriv;
        await assert.rejects(handler.prepare(), /denied/);
    }));
    const image = new module.HonorFrameImageHandler();
    image.user = { hasPriv: () => false };
    await assert.rejects(image.get('domain', new ObjectId(id)));
    const home = new module.HomeHonorFramesHandler();
    home.user = { _id: 42 };
    home.args = { uid: 99 };
    home.response = {};
    await home.post('domain', id);
    assert.equal(JSON.stringify(calls), JSON.stringify([[42, id]]));
    assert.equal(home.response.body.ok, true);
});

test('upload creates an unpublished normalized asset and cleans storage if catalog insertion fails', async () => {
    const stored: any[] = [];
    const deleted: string[] = [];
    const inserted: any[] = [];
    let failInsert = false;
    const module = load('../src/handler/honor-frame.ts', {
        'fs/promises': { readFile: async () => png(512) },
        '../context': {}, '../error': { ValidationError: Error },
        '../lib/honor-frame-image': { normalizeHonorFrameImage, MAX_FRAME_BYTES: 2 * 1024 * 1024 },
        '../lib/honor-frame-user': {}, '../model/builtin': { PRIV: {} },
        '../model/honor-frame': {
            coll: { insertOne: async (doc: any) => { if (failInsert) throw new Error('DB unavailable'); inserted.push(doc); } },
            framePath: (value: string, shape: string) => `honor-frame/${value}-${shape}.png`,
        },
        '../model/oplog': { log: async () => {} },
        '../model/storage': {
            put: async (path: string, buffer: Buffer) => { stored.push([path, buffer]); },
            del: async (paths: string[]) => { deleted.push(...paths); },
        },
        '../model/user': {},
        '../service/server': { Handler: class {}, param: () => () => {}, Types: { Range: () => undefined } },
    });
    const handler = new module.ManageHonorFramesHandler();
    handler.user = { _id: 1 };
    handler.request = { files: { square: { filepath: '/square', size: 1024 }, circle: { filepath: '/circle', size: 1024 } } };
    handler.response = {};
    handler.limitRate = async () => {};
    await handler.postUpload('domain-a', ' Champion ');
    assert.equal(inserted[0].name, 'Champion');
    assert.equal(inserted[0].active, false);
    assert.equal(inserted[0].createdBy, 1);
    assert.match(stored[0][0], /^honor-frame\/[a-f0-9]{24}-square\.png$/);
    assert.equal(inserted[0].artworkVersion, 2);
    assert.match(stored[1][0], /-circle\.png$/);
    assert.equal(PNG.sync.read(stored[0][1]).width, 512);
    failInsert = true;
    await assert.rejects(handler.postUpload('domain-b', 'Second'), /DB unavailable/);
    assert.equal(deleted[0], stored[2][0]);
    assert.equal(deleted[1], stored[3][0]);
    handler.request.files.square.size = 3 * 1024 * 1024;
    await assert.rejects(handler.postUpload('domain-a', 'Too large'));
    assert.equal(stored.length, 4);
});

test('wardrobe pagination reads only the authenticated users active awards and caps pages at twelve', async () => {
    let filter: any;
    let skip: number;
    let limit: number;
    const cursor = {
        sort: () => cursor,
        skip: (value: number) => { skip = value; return cursor; },
        limit: (value: number) => { limit = value; return cursor; },
        toArray: async () => [],
    };
    const module = load('../src/handler/honor-frame.ts', {
        '../context': {}, '../error': {}, '../lib/honor-frame-image': {}, '../lib/honor-frame-user': {},
        '../model/builtin': { PRIV: {} }, '../model/oplog': {}, '../model/storage': {},
        '../model/honor-frame': {
            coll: { countDocuments: async () => 25, find: (query: any) => { filter = query; return cursor; } },
            publicFrame: (doc: any) => doc, resolveFrames: async () => ({}),
        },
        '../model/user': { coll: { findOne: async (query: any) => {
            assert.equal(query._id, 42);
            return { honorFrameIds: [id], honorFrameId: '' };
        } } },
        '../service/server': { Handler: class {}, param: () => () => {}, Types: { Range: () => undefined } },
    });
    const handler = new module.HomeHonorFramesHandler();
    handler.user = { _id: 42 };
    handler.response = {};
    await handler.get('domain-b', 99);
    assert.equal(filter.active, true);
    assert.deepEqual(filter._id.$in.map((value: ObjectId) => value.toHexString()), [id]);
    assert.equal(limit, 12);
    assert.equal(skip, 24);
    assert.equal(handler.response.body.page, 3);
});
