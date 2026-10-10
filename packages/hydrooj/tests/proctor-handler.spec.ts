import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { PROCTOR_PROTOCOL, proctorOrigin, signedPayload, verifyPayload } from '../src/lib/proctor.ts';

const require = createRequire(import.meta.url);
const { ZipReader, Uint8ArrayReader, TextWriter } = require('@zip.js/zip.js');
const tid = new ObjectId('1234567890abcdef12345678');
const attemptId = new ObjectId();
function fixture(options: any = {}) {
    const calls: any[] = [];
    const rows: any[] = options.rows || [];
    class Handler {
        args: any = {}; response: any = { headers: {}, addHeader(name: string, value: string) { this.headers[name] = value; } };
        request: any = { headers: {}, path: '/d/exam/contest/x/proctor', ip: '203.0.113.7', host: 'oj.example' };
        context: any = { originalPath: this.request.path, origin: 'https://oj.example', protocol: 'https' };
        domain = { _id: 'exam', name: 'Exam Domain' };
        user = { _id: options.uid ?? 7, uname: options.uname || 'alice',
            hasPriv: (priv: number) => !options.noPrivilege && (priv !== 3 || !!options.superAdmin) };

        tdoc = { proctorEnabled: true, docId: tid, title: 'Contest', endAt: new Date(Date.now() + 100000) };
        tsdoc = { attend: 1 };
        checkPriv() { if (options.noPrivilege) throw new Error('denied'); }
        checkPerm() {}
        async limitRate() { return undefined; }
        binary(body: any, filename: string) { this.response.body = body; this.response.filename = filename; }
    }
    const model = {
        getConfig: async () => ({ maxLogMiB: 64, uploadGraceDays: 30, keyId: 'a'.repeat(32) }),
        getKeys: async () => ({ keyId: 'a'.repeat(32),
            signingPrivateKey: options.signingPrivateKey || 'auth-private', encryptionPrivateKey: 'log-private',
            signingPublicKey: 'auth-public', encryptionPublicKey: 'log-public' }),
        publicKeys: (keys: any) => ({ keyId: keys.keyId, signingPublicKey: keys.signingPublicKey, encryptionPublicKey: keys.encryptionPublicKey }),
        handshake: async (...args: any[]) => { calls.push(['handshake', ...args]); return { token: 'token' }; },
        refresh: async (...args: any[]) => { calls.push(['refresh', ...args]); return { token: 'token' }; },
        authenticate: async () => ({ uid: 7, domainId: 'exam', tid, attemptId }),
        closeAttempt: async () => ({ _id: attemptId }),
        acquireLogLock: async () => ({ assert: async () => {}, release: async () => calls.push('unlock') }),
        attempts: { updateOne: async (_: any, update: any) => calls.push(['attempt', update]) },
        logs: {
            countDocuments: async () => rows.length,
            findOne: async () => options.existing || null,
            insertOne: async (doc: any) => { if (options.insertFailure) throw new Error('db unavailable'); calls.push(['insert', doc]); },
            deleteMany: async () => calls.push('delete-metadata'),
            deleteOne: async () => calls.push('delete-metadata'),
            find: (query: any) => {
                let skip = 0;
                let limit = rows.length;
                const cursor = {
                    sort: () => cursor,
                    skip: (value: number) => { skip = value; return cursor; },
                    limit: (value: number) => { limit = value; return cursor; },
                    toArray: async () => query._id ? rows : rows.slice(skip, skip + limit),
                };
                return cursor;
            },
        },
    };
    const mocks: any = {
        '../error': { ForbiddenError: Error, NotFoundError: Error, ValidationError: Error },
        '../model/builtin': { PRIV: { PRIV_EDIT_SYSTEM: 1, PRIV_USER_PROFILE: 2, PRIV_ALL: 3 }, PERM: { PERM_VIEW_CONTEST: 1 } },
        '../service/server': { Handler, param: () => () => {}, requireSudo: (_: any, __: any, descriptor: any) => {
            const original = descriptor.value;
            descriptor.value = function sudo(...args: any[]) {
                if (options.noSudo) throw new Error('sudo required');
                return original.apply(this, args);
            };
        }, Types: {} },
        './contest': { ContestDetailBaseHandler: Handler },
        '../model/proctor': model,
        '../lib/proctor': { PROCTOR_PROTOCOL, proctorOrigin, signedPayload },
        '../model/system': { __esModule: true, default: { get: () => '' } },
        '../model/problem': { get: async () => ({ docId: options.problemId || 100 }) },
        '../model/contest': { get: async () => ({ pids: [100], proctorEnabled: true }),
            getStatus: async () => ({ attend: !options.notEnrolled }),
            setStatus: async (domainId: string, contestId: ObjectId, uid: number, status: any) => calls.push(['status', status]) },
        '../model/oplog': { log: async (...args: any[]) => calls.push(['audit', ...args.slice(1)]) },
        '../model/storage': { __esModule: true, default: {
            put: async () => { if (options.storageFailure) throw new Error('storage unavailable'); calls.push('put-file'); },
            del: async () => calls.push('delete-file'),
            exists: async () => !options.fileMissing,
            get: async (path: string) => Readable.from([Buffer.from(path)]),
        } },
        '../lib/proctor-log': { hashFile: async () => 'hash',
            validateEncryptedLog: async () => { if (options.badEncryption) throw new Error('invalid'); } },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/handler/proctor.ts', import.meta.url), 'utf8'),
        { loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    runInNewContext(code, { module, exports: module.exports, Buffer, URL, AbortController,
        require: (name: string) => mocks[name] ?? (name.startsWith('../') ? {} : require(name)) });
    const handler = new module.exports.ContestProctorHandler();
    handler.request.files = { file: { size: 1024, originalFilename: 'final.hplog', filepath: '/tmp/upload' } };
    return { exports: module.exports, handler, calls };
}

test('only registered participants in the same domain may use proctor APIs; only system admins manage logs', async () => {
    const f = fixture({ noPrivilege: true });
    await assert.rejects(new f.exports.ManageProctorLogsHandler().prepare());
    await assert.rejects(new f.exports.ManageProctorHandler().prepare());
    const g = fixture();
    await g.handler.prepare('exam', tid);
    await assert.rejects(g.handler.prepare('other', tid));
    g.handler.tsdoc.attend = 0;
    await assert.rejects(g.handler.prepare('exam', tid));
    g.handler.tsdoc.attend = 1;
    g.handler.request.headers.origin = 'https://evil.example';
    await assert.rejects(g.handler.prepare('exam', tid));
});

test('upload persists only metadata and ciphertext before qualifying the participant', async () => {
    const f = fixture();
    await f.handler.postUpload();
    const doc = f.calls.find((call) => call[0] === 'insert')[1];
    assert.equal(doc.username, 'alice');
    assert.equal(doc.domainId, 'exam');
    assert.equal(doc.filename, 'final.hplog');
    assert.equal(doc.size, 1024);
    assert.equal(doc.content, undefined);
    const qualified = f.calls.findIndex((call) => call[0] === 'status' && call[1].proctorLogUploaded);
    assert.ok(qualified > f.calls.findIndex((call) => call[0] === 'insert'));
    assert.equal(f.handler.response.body.ok, true);
    assert.equal(f.calls.at(-1), 'unlock');
});

test('corrupt, oversized, traversal-named or failed uploads never qualify a result', async () => {
    for (const options of [{ badEncryption: true }, { insertFailure: true }, { storageFailure: true }]) {
        const f = fixture(options);
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(f.handler.postUpload());
        assert.ok(!f.calls.some((call) => call[0] === 'status' && call[1].proctorLogUploaded));
        assert.equal(f.calls.at(-1), 'unlock');
    }
    const f = fixture();
    f.handler.request.files.file.originalFilename = '../secret.hplog';
    await assert.rejects(f.handler.postUpload());
    f.handler.request.files.file.originalFilename = 'final.hplog';
    f.handler.request.files.file.size = 65 * 1024 * 1024;
    await assert.rejects(f.handler.postUpload());
});

test('same-file retries are idempotent while replacing an already uploaded final log is forbidden', async () => {
    const f = fixture({ existing: { _id: new ObjectId(), sha256: 'hash' } });
    await f.handler.postUpload();
    assert.ok(!f.calls.some((call) => call === 'put-file' || call[0] === 'insert'));
    assert.equal(f.handler.response.body.ok, true);
    const g = fixture({ existing: { _id: new ObjectId(), sha256: 'different' } });
    await assert.rejects(g.handler.postUpload());
    assert.ok(!g.calls.some((call) => call[0] === 'status'));
    const partial = fixture({ existing: { _id: new ObjectId(), sha256: 'hash' }, fileMissing: true });
    await partial.handler.postUpload();
    assert.ok(partial.calls.includes('delete-metadata'));
    assert.ok(partial.calls.includes('put-file'));
    assert.equal(partial.handler.response.body.ok, true);
});

test('batch download creates a streamed archive with unique safe entry names and original file bytes', async () => {
    const rows = [1, 2].map((n) => ({ _id: new ObjectId(), attemptId, filename: 'final.hplog', path: `encrypted-${n}` }));
    const f = fixture({ rows });
    const h = new f.exports.ManageProctorLogsHandler();
    h.args.ids = rows.map((row) => row._id.toHexString());
    await h.postDownload();
    const chunks: Buffer[] = [];
    for await (const chunk of h.response.body) chunks.push(chunk);
    const archive = new ZipReader(new Uint8ArrayReader(Buffer.concat(chunks)));
    try {
        const entries = await archive.getEntries();
        assert.equal(entries.length, 2);
        assert.notEqual(entries[0].filename, entries[1].filename);
        assert.equal(await entries[0].getData(new TextWriter()), 'encrypted-1');
        assert.equal(await entries[1].getData(new TextWriter()), 'encrypted-2');
    } finally {
        await archive.close();
    }
});

test('batch delete invalidates results, releases all locks and bounds every selection', async () => {
    const row = { _id: new ObjectId(), attemptId, tid, domainId: 'exam', uid: 7, path: 'log' };
    const f = fixture({ rows: [row] });
    const h = new f.exports.ManageProctorLogsHandler();
    h.args.ids = [row._id.toHexString()];
    await h.postDelete();
    assert.equal(f.calls.find((call) => call[0] === 'status')[1].proctorLogUploaded, false);
    assert.ok(f.calls.indexOf('delete-file') < f.calls.indexOf('delete-metadata'));
    assert.equal(f.calls.at(-1), 'unlock');
    h.args.ids = Array.from({ length: 51 }).fill(row._id.toHexString());
    await assert.rejects(h.postDownload());
    h.args.ids = ['../../etc/passwd'];
    await assert.rejects(h.postDelete());
});

test('settings embed a bounded 25/50 log page without private keys or client enrollment data', async () => {
    const rows = Array.from({ length: 71 }, (_, index) => ({ _id: new ObjectId(), filename: `log-${index}.hplog`,
        path: 'private-path', sha256: 'private-hash', attemptId }));
    const f = fixture({ rows });
    const h = new f.exports.ManageProctorHandler();
    await h.prepare();
    await h.get('', 2, '', 25);
    assert.equal(h.response.body.logs.length, 25);
    assert.equal(h.response.body.pageCount, 3);
    assert.equal(h.response.body.logs[0].filename, 'log-25.hplog');
    assert.equal(h.response.body.logs[0].path, undefined);
    assert.equal(h.response.body.keys.signingPrivateKey, undefined);
    assert.equal(h.response.body.devices, undefined);
    assert.equal(h.response.headers['Cache-Control'], 'no-store');
    assert.equal(h.postEnroll, undefined);
    await h.get('', 99, '', 50);
    assert.equal(h.response.body.page, 2);
    assert.equal(h.response.body.logs.length, 21);
    assert.equal(h.response.body.pageSize, 50);
    await assert.rejects(h.get('', 1, '', 500));
});

test('private key viewing is a separate sudo action with no-cache response and metadata-only audit', async () => {
    const denied = fixture({ noSudo: true });
    assert.throws(() => new denied.exports.ManageProctorHandler().postRevealKeys(), /sudo required/);
    const f = fixture();
    const h = new f.exports.ManageProctorHandler();
    await h.postRevealKeys();
    assert.equal(h.response.body.privateKeys.signingPrivateKey, 'auth-private');
    assert.equal(h.response.body.privateKeys.encryptionPrivateKey, 'log-private');
    assert.equal(h.response.headers['Cache-Control'], 'no-store');
    assert.ok(!JSON.stringify(f.calls).includes('auth-private'));
    assert.ok(!JSON.stringify(f.calls).includes('log-private'));
    h.context.origin = 'http://oj.example';
    await assert.rejects(h.postRevealKeys(), /HTTPS/);
});

test('management APIs reject cross-site and malformed origins', async () => {
    const f = fixture();
    const h = new f.exports.ManageProctorHandler();
    h.request.headers.origin = 'https://evil.example';
    await assert.rejects(h.prepare(), /origin/);
    h.request.headers.origin = 'null';
    await assert.rejects(h.prepare(), /origin/);
    h.request.headers.origin = 'https://oj.example';
    await h.prepare();
});

test('handshake and refresh record the server-observed IP, not a client-supplied IP', async () => {
    const f = fixture();
    f.handler.args.ip = 'spoofed';
    await f.handler.postHandshake('', 'challenge', 'signature');
    assert.equal(f.calls.find((call) => call[0] === 'handshake')[4], '203.0.113.7');
    await f.handler.postRefresh();
    assert.equal(f.calls.find((call) => call[0] === 'refresh')[2], '203.0.113.7');
});

const identityKeys = generateKeyPairSync('ed25519');
const identityPrivateKey = identityKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const identityPublicKey = identityKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
test('native identity signs fresh scoped login; only super-admin privileges enable root debug', async () => {
    const accounts = [{ uid: 2, superAdmin: true }, { uid: 7, uname: 'root' }, { uid: 1 }, { uid: 0 },
        { uid: 2, superAdmin: true, noPrivilege: true }];
    await Promise.all(accounts.map(async (options) => {
        const f = fixture({ ...options, signingPrivateKey: identityPrivateKey });
        const handler = new f.exports.ProctorIdentityHandler();
        await handler.post('exam', 'n'.repeat(43));
        const { payload, signature } = handler.response.body;
        assert.ok(verifyPayload(payload, signature, identityPublicKey));
        assert.equal(payload.root, !!options.superAdmin && !options.noPrivilege);
        assert.equal(payload.uid, options.uid);
        assert.equal(payload.clientNonce, 'n'.repeat(43));
        assert.equal(payload.origin, 'https://oj.example');
        assert.equal(payload.tid, '');
        assert.equal(handler.response.headers['Cache-Control'], 'no-store');
    }));
});
test('native identity binds contest membership and display PID to numeric PID, rejects invalid scope', async () => {
    const f = fixture({ signingPrivateKey: identityPrivateKey });
    const handler = new f.exports.ProctorIdentityHandler();
    await handler.post('exam', 'n'.repeat(43), tid, 'P100');
    assert.equal(handler.response.body.payload.pid, 100);
    assert.equal(handler.response.body.payload.routePid, 'P100');
    assert.equal(handler.response.body.payload.tid, tid.toHexString());
    assert.equal(handler.response.body.payload.proctorEnabled, true);
    await assert.rejects(handler.post('other', 'n'.repeat(43)));
    await assert.rejects(handler.post('exam', 'bad'));
    await assert.rejects(new (fixture({ notEnrolled: true }).exports.ProctorIdentityHandler)().post('exam', 'n'.repeat(43), tid));
    await assert.rejects(new (fixture({ problemId: 101 }).exports.ProctorIdentityHandler)().post('exam', 'n'.repeat(43), tid, 'P101'));
});
