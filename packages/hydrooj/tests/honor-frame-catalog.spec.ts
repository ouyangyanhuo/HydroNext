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
class ValidationError extends Error {
    params: any[];
    constructor(...params: any[]) { super(params[2] || params[0]); this.params = params; }
}
function artwork(red = 100) {
    const image = new PNG({ width: 512, height: 512 });
    image.data.fill(0);
    image.data[0] = red;
    image.data[3] = 255;
    return PNG.sync.write(image);
}
function fixture(initial: any[] = []) {
    const docs = structuredClone(initial).map((doc) => ({ ...doc, _id: new ObjectId(doc._id) }));
    const assets = new Map<string, Buffer>();
    function matches(doc: any, query: any): boolean {
        return Object.entries(query).every(([key, value]: [string, any]) => {
            if (key === '$or') return value.some((clause: any) => matches(doc, clause));
            if (value?.$exists !== undefined) return (doc[key] !== undefined) === value.$exists;
            if (value?.$ne !== undefined) return String(doc[key]) !== String(value.$ne);
            return String(doc[key]) === String(value);
        });
    }
    const coll = {
        findOne: async (query: any) => docs.find((doc) => matches(doc, query)),
        find: (query: any) => {
            const data = docs.filter((doc) => matches(doc, query));
            const cursor = { project: () => cursor, toArray: async () => data,
                async *[Symbol.asyncIterator]() { yield* data; } };
            return cursor;
        },
        updateOne: async (query: any, update: any) => {
            const doc = docs.find((item) => matches(item, query));
            if (!doc) return;
            const [key, value] = Object.entries(update.$set)[0];
            if (docs.some((other) => other !== doc && other[key] === value)) {
                throw Object.assign(new Error('Duplicate'), { code: 11000 });
            }
            Object.assign(doc, update.$set);
        },
    };
    const module = { exports: {} as any };
    const source = readFileSync(new URL('../src/lib/honor-frame-catalog.ts', import.meta.url), 'utf8');
    const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
    const mocks = {
        '../error': { ValidationError },
        '../model/honor-frame': { coll, framePath: (id: string, shape: string) => `${id}/${shape}` },
        '../model/storage': { get: async (path: string) => {
            if (!assets.has(path)) throw new Error('Missing artwork');
            return assets.get(path);
        } },
        './honor-frame-image': { normalizeHonorFrameImage, MAX_FRAME_BYTES: 2 * 1024 * 1024 },
    };
    runInNewContext(code, { module, exports: module.exports, Buffer, require: (name: string) => mocks[name] ?? require(name) });
    return { ...module.exports, docs, assets };
}

test('name uniqueness ignores surrounding whitespace, case and compatibility-width characters, including legacy names', async () => {
    const id = new ObjectId().toHexString();
    const api = fixture([{ _id: id, name: ' Ｃhampion ', active: true }]);
    assert.equal(api.frameNameKey(' Ｃhampion '), 'champion');
    await assert.rejects(api.assertUniqueFrame('champion'), /name already exists/);
    await api.assertUniqueFrame('champion', undefined, new ObjectId(id));
    await api.assertUniqueFrame('New frame');
});

test('artwork uniqueness compares decoded pixels rather than compression or invisible RGB', () => {
    const api = fixture();
    const a = artwork();
    const decoded = PNG.sync.read(a);
    decoded.data[4] = 200;
    const same = PNG.sync.write(decoded, { deflateLevel: 1 });
    assert.equal(api.frameArtworkHash([a, a]), api.frameArtworkHash([same, a]));
    assert.notEqual(api.frameArtworkHash([a, a]), api.frameArtworkHash([a, artwork(101)]));
    assert.notEqual(api.frameArtworkHash([a, artwork(101)]), api.frameArtworkHash([artwork(101), a]));
});

test('legacy duplicate assets acquire searchable keys without removing owned frames', async () => {
    const ids = [new ObjectId().toHexString(), new ObjectId().toHexString()];
    const api = fixture(ids.map((_id) => ({ _id, name: 'Champion', active: true, artworkVersion: 2 })));
    for (const id of ids) for (const shape of ['circle', 'square']) api.assets.set(`${id}/${shape}`, artwork());
    await assert.rejects(api.assertUniqueFrame('Another name', api.frameArtworkHash([artwork(), artwork()])), /already been uploaded/);
    await assert.rejects(api.assertUniqueFrame('Champion', undefined, new ObjectId(ids[0])), /name already exists/);
    assert.equal(api.docs.length, 2);
    assert.ok(api.docs.some((doc: any) => doc.artworkHash));
    assert.ok(api.docs.every((doc: any) => doc.name === 'Champion' && doc.active));
});

test('database duplicate-key races become actionable name or artwork errors', () => {
    const api = fixture();
    assert.match(api.frameDuplicateError({ code: 11000, keyPattern: { nameKey: 1 } }).message, /name already exists/);
    assert.match(api.frameDuplicateError({ code: 11000, keyPattern: { artworkHash: 1 } }).message, /already been uploaded/);
    const failure = new Error('Storage failed');
    assert.equal(api.frameDuplicateError(failure), failure);
});

test('editing can retain its own artwork, but cannot reuse another frame artwork', async () => {
    const id = new ObjectId();
    const other = new ObjectId();
    const api = fixture([
        { _id: id.toHexString(), name: 'First', nameKey: 'first', artworkHash: 'first-hash' },
        { _id: other.toHexString(), name: 'Second', nameKey: 'second', artworkHash: 'second-hash' },
    ]);
    await api.assertUniqueFrame('First', 'first-hash', id);
    await assert.rejects(api.assertUniqueFrame('First', 'second-hash', id), /already been uploaded/);
    await assert.rejects(api.assertUniqueFrame('Second', 'first-hash', id), /name already exists/);
});
