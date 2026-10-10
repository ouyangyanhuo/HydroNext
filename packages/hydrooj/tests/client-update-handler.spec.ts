import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import * as updateLib from '../src/lib/client-update.ts';

const require = createRequire(import.meta.url);
const id = new ObjectId('1234567890abcdef12345678');
const asset = { _id: id, kind: 'asar', version: '1.2.3', filename: 'app.asar', size: 25000, sha256: 'a'.repeat(64), path: 'private/path', bundleError: '' };
function fixture(options: any = {}) {
    const calls: any[] = [];
    let config: any = { revision: 0, draft: { ...updateLib.defaultDraft, origin: 'https://oj.example', version: '1.2.3', buildVersion: '2026101001', asar: id.toHexString() },
        ...(options.published ? { publishedAssets: [id.toHexString()], manifest: { version: '1.2.3', hotUpdate: { sha256: 'a'.repeat(64) } } } : {}),
        ...options.config };
    const rows = options.rows || [{ ...asset, ...options.asset }];
    class Handler {
        request: any = { headers: {}, host: 'oj.example', files: {} };
        session = { sudo: Date.now() };
        args: any = {};
        user = { _id: 1 };
        context = { origin: 'http://internal:2333' };
        response: any = { headers: {}, addHeader(name: string, value: string) { this.headers[name] = value; } };
        checkPriv() { if (options.noPrivilege) throw new Error('denied'); }
        async limitRate() { return undefined; }
    }
    const model = {
        getSettings: async () => config,
        cleanupDeletedAssets: async () => {
            if (options.cleanupFailure) throw new Error('storage unavailable');
            calls.push('cleanup');
        },
        publicAsset: ({ _id, path, ...row }: any) => ({ ...row, id: _id.toHexString() }),
        assets: {
            findOne: async ({ _id }: any) => rows.find((row: any) => row._id.equals(_id)),
            countDocuments: async (query: any) => rows.filter((row: any) => !query._id?.$nin?.some((key: any) => row._id.equals(key))).length,
            find: (query: any) => {
                let skip = 0;
                let limit = rows.length;
                const cursor = { sort: () => cursor,
                    skip: (n: number) => { skip = n; return cursor; },
                    limit: (n: number) => { limit = n; return cursor; },
                    toArray: async () => {
                        const selected = rows.filter((row: any) => (!query._id?.$in || query._id.$in.some((key: any) => row._id.equals(key)))
                            && !query._id?.$nin?.some((key: any) => row._id.equals(key)));
                        return selected.slice(skip, skip + limit);
                    } };
                return cursor;
            },
            insertOne: async () => { if (options.insertFailure) throw new Error('insert failed'); calls.push('insert'); },
        },
        settings: {
            findOne: async () => config,
            updateOne: async (filter: any, change: any) => {
                calls.push(['write', change]);
                if (options.conflict || filter.revision !== config.revision) return { modifiedCount: 0 };
                config = { ...config, ...change.$set, revision: config.revision + 1,
                    publishedAssets: [...(config.publishedAssets || []), ...(change.$addToSet?.publishedAssets?.$each || [])]
                        .filter((key) => key !== change.$pull?.publishedAssets),
                    deletedAssets: [...(config.deletedAssets || []), ...(change.$addToSet?.deletedAssets ? [change.$addToSet.deletedAssets] : [])],
                    cleanupAssets: [...(config.cleanupAssets || []), ...(change.$addToSet?.cleanupAssets ? [change.$addToSet.cleanupAssets] : [])] };
                return { modifiedCount: 1 };
            },
        },
    };
    const mocks: any = {
        '../lib/client-update': { ...updateLib,
            inspectUpdateFile: async () => ({ bundleVersion: '1.2.3', bundleError: '' }),
            verifyUpdateStream: async () => {
                if (options.corruptedFile) throw new Error('corrupt');
                await options.beforeVerify?.();
            } },
        '../lib/proctor-log': { hashFile: async () => 'a'.repeat(64) },
        '../model/client-update': model,
        '../model/builtin': { PRIV: { PRIV_EDIT_SYSTEM: 1 } },
        '../error': { ForbiddenError: Error, NotFoundError: Error, ValidationError: Error },
        '../model/oplog': { log: async () => calls.push('audit') },
        '../model/system': { __esModule: true, default: { get: () => 'https://oj.example' } },
        '../model/storage': { __esModule: true, default: {
            exists: async () => !options.fileMissing,
            put: async () => calls.push('put'), del: async () => calls.push('cleanup'),
            get: async () => Readable.from(['binary']),
        } },
        '../service/server': { Handler, param: () => () => {}, Types: {},
            requireSudo: (_: any, __: any, descriptor: any) => {
                const original = descriptor.value;
                descriptor.value = function sudo(...args: any[]) {
                    if (options.noSudo) throw new Error('sudo required');
                    return original.apply(this, args);
                };
            } },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/handler/client-update.ts', import.meta.url), 'utf8'),
        { loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    runInNewContext(code, { module, exports: module.exports, URL, Buffer,
        require: (name: string) => mocks[name] ?? (name.startsWith('../') ? {} : require(name)) });
    const admin = new module.exports.ManageClientUpdatesHandler();
    admin.args = { draft: config.draft, revision: 0 };
    return { exports: module.exports, admin, calls, state: () => config };
}

test('update management requires system privileges, same-origin writes and recent authorization', async () => {
    await assert.rejects(fixture({ noPrivilege: true }).admin.prepare());
    const f = fixture();
    f.admin.request.headers.origin = 'https://evil.example';
    await assert.rejects(f.admin.prepare());
    f.admin.session.sudo = 0;
    await assert.rejects(f.admin.postUpload());
    await assert.rejects(async () => fixture({ noSudo: true }).admin.postSave());
    await assert.rejects(async () => fixture({ noSudo: true }).admin.postPublish());
});

test('save is private, publish atomically enables manifest and package access, stale writers are rejected', async () => {
    const f = fixture();
    await f.admin.postSave();
    assert.equal(f.state().manifest, undefined);
    assert.equal(f.state().publishedAssets.length, 0);
    f.admin.args.revision = 1;
    await f.admin.postPublish();
    assert.equal(f.state().manifest.version, '1.2.3');
    assert.deepEqual(f.state().publishedAssets, [id.toHexString()]);
    const change = f.calls.filter((call) => call[0] === 'write')[1][1];
    assert.ok(change.$set.manifest);
    assert.ok(change.$addToSet.publishedAssets.$each.includes(id.toHexString()));
    await assert.rejects(f.admin.postPublish());
    await assert.rejects(fixture({ conflict: true }).admin.postPublish());
});

test('publication refuses invalid, missing or corrupted uploaded packages', async () => {
    await assert.rejects(fixture({ fileMissing: true }).admin.postPublish());
    await assert.rejects(fixture({ corruptedFile: true }).admin.postPublish());
    await assert.rejects(fixture({ asset: { bundleError: 'Invalid entry point' } }).admin.postPublish());
    await assert.rejects(fixture({ rows: [] }).admin.postPublish());
});

test('all version fields can decrease and publication is not ordered by display version', async () => {
    const f = fixture({ config: { manifest: { version: '9.0.0', minClientVersion: '8.0.0', buildVersion: '2026101101' } } });
    await f.admin.postPublish();
    assert.equal(f.state().manifest.version, '1.2.3');
    assert.equal(f.state().manifest.minClientVersion, '1.0.0');
    assert.equal(f.state().manifest.buildVersion, '2026101001');
    await fixture({ published: true, asset: { sha256: 'b'.repeat(64) } }).admin.postPublish();
});

test('URL-only and mixed releases are publishable and manifest origin remains the OJ, not the download host', async () => {
    const f = fixture({ rows: [] });
    f.admin.args.draft = { ...f.admin.args.draft, asar: '', installerUrl: 'https://cdn.example/setup.exe' };
    await f.admin.postPublish();
    assert.equal(f.state().manifest.fullUpdate.installerUrl, 'https://cdn.example/setup.exe');
    assert.equal(f.state().publishedOrigin, 'https://oj.example');
    assert.equal(f.state().publishedAssets.length, 0);
    const mixed = fixture();
    mixed.admin.args.draft.portableUrl = 'https://cdn.example/portable.exe';
    await mixed.admin.postPublish();
    assert.ok(mixed.state().manifest.hotUpdate);
    assert.ok(mixed.state().manifest.fullUpdate.portableUrl);
    const empty = fixture();
    empty.admin.args.draft.asar = '';
    await assert.rejects(empty.admin.postPublish());
});

test('local package URLs verify actual assets and become public; deleted, missing and mismatched references are rejected', async () => {
    const url = `https://oj.example/client-updates/packages/${id.toHexString()}/app.asar`;
    const f = fixture();
    f.admin.args.draft = { ...f.admin.args.draft, asar: '', asarUrl: url, asarSize: asset.size, asarSha256: asset.sha256 };
    await f.admin.postPublish();
    assert.ok(f.state().publishedAssets.includes(id.toHexString()));
    await new f.exports.ClientUpdatePackageHandler().get(null, id, 'app.asar');
    await assert.rejects(f.admin.postDelete(null, id));
    for (const options of [{ rows: [] }, { fileMissing: true }, { corruptedFile: true }, { config: { deletedAssets: [id.toHexString()] } },
        { asset: { filename: 'different.asar' } }, { asset: { kind: 'installer' } }, { asset: { sha256: 'b'.repeat(64) } }]) {
        const bad = fixture(options);
        bad.admin.args.draft = { ...f.admin.args.draft };
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(bad.admin.postPublish());
    }
});

test('legacy drafts receive new defaults without rewriting the published manifest', async () => {
    const f = fixture();
    delete f.state().draft.buildVersion;
    delete f.state().draft.installerUrl;
    await f.admin.get(null);
    assert.equal(f.admin.response.body.draft.buildVersion, '');
    assert.equal(f.admin.response.body.draft.installerUrl, '');
});

test('editing legacy draft origins never changes the displayed published manifest origin', async () => {
    const f = fixture({ config: { manifest: { version: '1.2.3', hotUpdate: {
        asarUrl: `https://original.example/client-updates/packages/${id.toHexString()}/app.asar`,
    } } } });
    f.admin.args.draft.origin = 'https://new.example';
    await f.admin.postSave();
    assert.equal(f.admin.response.body.publishedOrigin, 'https://original.example');
    await f.admin.get(null);
    assert.equal(f.admin.response.body.publishedOrigin, 'https://original.example');
});

test('public manifest is an exact raw JSON response without UI injection and never cached', async () => {
    const f = fixture({ published: true });
    const handler = new f.exports.ClientUpdateManifestHandler();
    await handler.get();
    assert.ok(Buffer.isBuffer(handler.response.body));
    assert.equal(handler.response.type, 'application/json');
    assert.equal(handler.response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(JSON.parse(handler.response.body), f.state().manifest);
    assert.equal(JSON.parse(handler.response.body).UiContext, undefined);
    const empty = fixture();
    await assert.rejects(new empty.exports.ClientUpdateManifestHandler().get());
});

test('public package downloads reject draft, missing, mismatched filename and unknown-ID requests', async () => {
    const unpublished = fixture();
    await assert.rejects(new unpublished.exports.ClientUpdatePackageHandler().get(null, id, 'app.asar'));
    const f = fixture({ published: true });
    const handler = new f.exports.ClientUpdatePackageHandler();
    await handler.get(null, id, 'app.asar');
    assert.equal(handler.response.headers['Content-Length'], '25000');
    assert.ok(handler.response.headers['Cache-Control'].includes('immutable'));
    await assert.rejects(handler.get(null, id, '../package.json'));
    await assert.rejects(handler.get(null, new ObjectId(), 'app.asar'));
    const missing = fixture({ published: true, fileMissing: true });
    await assert.rejects(new missing.exports.ClientUpdatePackageHandler().get(null, id, 'app.asar'));
});

test('library is bounded to 25 entries and does not expose storage paths', async () => {
    const rows = Array.from({ length: 60 }).fill(null).map(() => ({ ...asset, _id: new ObjectId() }));
    const f = fixture({ rows });
    await f.admin.get(null, 2);
    assert.equal(f.admin.response.body.assets.length, 25);
    assert.equal(f.admin.response.body.pageCount, 3);
    assert.equal(f.admin.response.body.assets[0].path, undefined);
    assert.equal(f.admin.response.body.draft.origin, 'https://oj.example');
});

test('failed metadata persistence cleans up uploaded storage and never publishes implicitly', async () => {
    const f = fixture({ insertFailure: true });
    f.admin.args = { kind: 'asar', version: '1.2.3' };
    f.admin.request.files = { file: { filepath: '/tmp/upload', originalFilename: 'app.asar', size: 25000 } };
    await assert.rejects(f.admin.postUpload());
    assert.ok(f.calls.includes('cleanup'));
    assert.equal(f.state().manifest, undefined);
});

test('deleting historical packages revokes URLs atomically, clears saved selections and excludes them from the library', async () => {
    const f = fixture({ published: true });
    // This older package is not referenced by the current published manifest.
    await f.admin.postDelete(null, id);
    assert.equal(f.admin.response.body.deletedId, id.toHexString());
    assert.equal(f.state().revision, 1);
    assert.equal(f.state().draft.asar, '');
    assert.deepEqual(f.state().publishedAssets, []);
    assert.ok(f.state().deletedAssets.includes(id.toHexString()));
    assert.ok(f.state().cleanupAssets.includes(id.toHexString()));
    assert.ok(f.calls.includes('cleanup'));
    await assert.rejects(new f.exports.ClientUpdatePackageHandler().get(null, id, 'app.asar'));
    await f.admin.get(null, 99);
    assert.equal(f.admin.response.body.assets.length, 0);
    assert.equal(f.admin.response.body.page, 1);
    // Deletion leaves the published JSON itself untouched.
    assert.equal(f.state().manifest.version, '1.2.3');
});

test('all current manifest URL types including fallbacks are protected, with authorization and revision checks', async () => {
    const url = `https://oj.example/client-updates/packages/${id.toHexString()}/app.asar`;
    const manifests = [{ hotUpdate: { asarUrl: url } }, { hotUpdate: { fallbackUrl: url } },
        { config: { url } }, { config: { fallbackUrl: url } }, { fullUpdate: { installerUrl: url } }, { fullUpdate: { portableUrl: url } }];
    for (const manifest of manifests) {
        const f = fixture({ config: { manifest } });
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(f.admin.postDelete(null, id));
        assert.equal(f.calls.length, 0);
    }
    await assert.rejects(async () => fixture({ noSudo: true }).admin.postDelete(null, id));
    await assert.rejects(fixture({ conflict: true }).admin.postDelete(null, id));
    await assert.rejects(fixture().admin.postDelete(null, new ObjectId()));
    const stale = fixture({ config: { revision: 1 } });
    await assert.rejects(stale.admin.postDelete(null, id));
});

test('file cleanup failures retain a retry outbox but cannot make deleted packages public or selectable again', async () => {
    const f = fixture({ published: true, cleanupFailure: true });
    await f.admin.postDelete(null, id);
    assert.equal(f.admin.response.body.cleanupPending, true);
    assert.ok(f.state().cleanupAssets.includes(id.toHexString()));
    f.admin.args = { revision: 1, draft: { ...f.state().draft, asar: id.toHexString() } };
    await assert.rejects(f.admin.postPublish());
    await assert.rejects(f.admin.postSave());
    await assert.rejects(new f.exports.ClientUpdatePackageHandler().get(null, id, 'app.asar'));
});

test('deletion wins against an in-flight publish without exposing a manifest referencing deleted files', async () => {
    let resume: () => void;
    let entered: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    const verification = new Promise<void>((resolve) => { entered = resolve; });
    const f = fixture({ beforeVerify: async () => {
        entered();
        await paused;
    } });
    const publishing = f.admin.postPublish();
    await verification;
    await f.admin.postDelete(null, id);
    resume();
    await assert.rejects(publishing);
    assert.equal(f.state().manifest, undefined);
    assert.ok(f.state().deletedAssets.includes(id.toHexString()));
});
