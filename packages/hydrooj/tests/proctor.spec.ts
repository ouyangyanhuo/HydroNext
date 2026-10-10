import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import * as cryptoHelpers from '../src/lib/proctor.ts';

const require = createRequire(import.meta.url);
const server = generateKeyPairSync('ed25519');
const client = generateKeyPairSync('ed25519');
const serverKeys = { keyId: 'a'.repeat(32),
    signingPrivateKey: server.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    signingPublicKey: server.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    encryptionPrivateKey: 'private-encryption-key', encryptionPublicKey: 'public-encryption-key' };
const clientPrivate = client.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const clientPublic = client.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const fingerprint = 'b'.repeat(64);
const identity = { uid: 7, domainId: 'exam', tid: new ObjectId('1234567890abcdef12345678') };

function same(a: any, b: any) {
    if (a?.toHexString || b?.toHexString) return String(a) === String(b);
    if (a?.getTime || b?.getTime) return a?.getTime?.() === b?.getTime?.();
    return a === b;
}
function matches(doc: any, query: any): boolean {
    return Object.entries<any>(query).every(([key, value]) => {
        if (key === '$or') return value.some((part: any) => matches(doc, part));
        if (key === '$and') return value.every((part: any) => matches(doc, part));
        if (value && typeof value === 'object' && !value.toHexString && !value.getTime) {
            return Object.entries<any>(value).every(([op, expected]) => {
                if (op === '$gt') return doc[key] > expected;
                if (op === '$lte') return doc[key] <= expected;
                if (op === '$ne') return !same(doc[key], expected);
                if (op === '$in') return expected.some((item: any) => same(doc[key], item));
                if (op === '$exists') return (doc[key] !== undefined) === expected;
                throw new Error(`Unsupported test operator ${op}`);
            });
        }
        return value === null ? doc[key] == null : same(doc[key], value);
    });
}
class Collection {
    rows: any[] = [];
    readonly name: string;
    constructor(name: string) { this.name = name; }
    async findOne(query: any) { return this.rows.find((row) => matches(row, query)) || null; }
    async insertOne(doc: any) {
        const duplicate = this.rows.some((row) => same(row._id, doc._id)
            || (this.name.endsWith('.attempt') && row.uid === doc.uid && row.domainId === doc.domainId && same(row.tid, doc.tid)));
        if (duplicate) throw Object.assign(new Error('duplicate'), { code: 11000 });
        this.rows.push({ ...doc });
        return { insertedId: doc._id };
    }

    async updateOne(query: any, update: any, options: any = {}) {
        let doc = this.rows.find((row) => matches(row, query));
        if (!doc && !options.upsert) return { matchedCount: 0, modifiedCount: 0 };
        if (!doc) {
            doc = { ...query, ...update.$setOnInsert };
            await this.insertOne(doc);
            doc = await this.findOne({ _id: doc._id });
        }
        Object.assign(doc, update.$set);
        for (const key of Object.keys(update.$unset || {})) delete doc[key];
        return { matchedCount: 1, modifiedCount: 1 };
    }

    async findOneAndUpdate(query: any, update: any, options: any) {
        await this.updateOne(query, update, options);
        return this.findOne(query);
    }

    async findOneAndDelete(query: any) {
        const doc = this.rows.find((row) => matches(row, query));
        if (doc) this.rows.splice(this.rows.indexOf(doc), 1);
        return doc;
    }

    async deleteOne(query: any) { return { deletedCount: await this.findOneAndDelete(query) ? 1 : 0 }; }
    async countDocuments(query: any) { return this.rows.filter((row) => matches(row, query)).length; }
}

function fixture(options: { missingKeys?: boolean } = {}) {
    const collections = new Map<string, Collection>();
    const coll = (name: string) => {
        if (!collections.has(name)) collections.set(name, new Collection(name));
        return collections.get(name)!;
    };
    coll('proctor.config').rows.push({ _id: 'config', enabled: true, requiredVersion: '1.0.0', keyId: serverKeys.keyId });
    const statuses: any[] = [];
    const files = new Map<string, string>();
    const fileOps: any[] = [];
    const mocks: any = {
        '../error': { ForbiddenError: Error, ValidationError: Error },
        '../lib/proctor': cryptoHelpers,
        '../service/db': { __esModule: true, default: { collection: coll } },
        './contest': { setStatus: async (...args: any[]) => statuses.push(args) },
        'fs/promises': {
            readFile: async (path: string) => {
                if (options.missingKeys) throw Object.assign(new Error('missing key file'), { code: 'ENOENT' });
                return files.get(path) || JSON.stringify(serverKeys);
            },
            mkdir: async (...args: any[]) => fileOps.push(['mkdir', ...args]),
            writeFile: async (path: string, data: string, writeOptions: any) => { files.set(path, data); fileOps.push(['write', writeOptions]); },
        },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/model/proctor.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
    runInNewContext(code, { module, exports: module.exports, Buffer, process, setInterval, clearInterval,
        require: (name: string) => mocks[name] ?? require(name) });
    const model = module.exports;
    const tdoc = { proctorEnabled: true, beginAt: new Date(Date.now() - 1000), endAt: new Date(Date.now() + 3600000) };
    const raw = { version: '1.0.0', fingerprint, clientNonce: cryptoHelpers.secret(), publicKey: clientPublic,
        deviceInfo: { platform: 'win32', osVersion: '10.0.26100', arch: 'x64' } };
    const start = async () => {
        const challenge = await model.challenge(identity, tdoc, raw, 'https://oj.example');
        const response = await model.handshake(identity, challenge.payload.challengeId,
            cryptoHelpers.signedPayload(challenge.payload, clientPrivate), '203.0.113.7');
        return { challenge, response };
    };
    return { model, coll, raw, tdoc, start, statuses, files, fileOps };
}

function proof(token: string, action: string, payload: unknown, overrides: any = {}) {
    const claim = { protocol: cryptoHelpers.PROCTOR_PROTOCOL, action, method: 'POST', path: '/d/exam/p/1/submit',
        tokenHash: cryptoHelpers.digest(token), fingerprint, version: '1.0.0', payloadHash: cryptoHelpers.digest(cryptoHelpers.canonical(payload)),
        timestamp: Date.now(), nonce: cryptoHelpers.secret(), ...overrides };
    return Buffer.from(JSON.stringify({ payload: claim, signature: cryptoHelpers.signedPayload(claim, clientPrivate) })).toString('base64url');
}

test('automatic mutual handshake issues tokens without registration and stores only token hashes with session metadata', async () => {
    const f = fixture();
    const { challenge, response } = await f.start();
    assert.ok(cryptoHelpers.verifyPayload(challenge.payload, challenge.signature, serverKeys.signingPublicKey));
    assert.ok(cryptoHelpers.verifyPayload(response.payload, response.signature, serverKeys.signingPublicKey));
    assert.equal(f.model.createEnrollment, undefined);
    assert.equal(f.model.devices, undefined);
    assert.equal(f.coll('proctor.challenge').rows.length, 0);
    assert.equal(f.coll('proctor.session').rows[0]._id, cryptoHelpers.digest(response.token));
    assert.equal(f.coll('proctor.session').rows[0].ip, '203.0.113.7');
    assert.equal(f.coll('proctor.session').rows[0].uid, identity.uid);
    assert.equal(f.coll('proctor.session').rows[0].publicKey, clientPublic);
    assert.equal(JSON.stringify(f.coll('proctor.session').rows[0].deviceInfo), JSON.stringify(f.raw.deviceInfo));
    assert.ok(!JSON.stringify(f.coll('proctor.session').rows).includes(response.token));
    await assert.rejects(f.model.handshake(identity, challenge.payload.challengeId, cryptoHelpers.signedPayload(challenge.payload, clientPrivate)));
    assert.equal(f.coll('proctor.session').rows.length, 1);
});

test('wrong versions, invalid keys, invalid device metadata and bad handshake signatures fail closed', async () => {
    const f = fixture();
    for (const changes of [{ version: '2.0.0' }, { fingerprint: 'invalid' }, { publicKey: 'fake' },
        { deviceInfo: [] }, { deviceInfo: { platform: 'x'.repeat(129) } }, { deviceInfo: { arch: 'x\n' } }]) {
        await assert.rejects(f.model.challenge(identity, f.tdoc, { ...f.raw, ...changes }, 'https://oj.example'));
    }
    const c = await f.model.challenge(identity, f.tdoc, f.raw, 'https://oj.example');
    await assert.rejects(f.model.handshake(identity, c.payload.challengeId, cryptoHelpers.signedPayload(c.payload, serverKeys.signingPrivateKey)));
    assert.equal(f.coll('proctor.session').rows.length, 0);
});

test('proof binds code, method, path, fingerprint, version, UID, domain and contest; nonces cannot replay', async () => {
    const f = fixture();
    const { response } = await f.start();
    const payload = cryptoHelpers.submissionPayload(1, 'cc', 'int main(){}');
    const authenticate = (encoded: string, id = identity, data = payload) => f.model.authenticate(id, response.token, encoded,
        'submit', '/d/exam/p/1/submit', data);
    for (const changes of [{ method: 'GET' }, { path: '/p/1/submit' }, { fingerprint: 'c'.repeat(64) }, { version: '2.0' },
        { action: 'upload' }, { timestamp: Date.now() - 61000 }, { nonce: 'short' }]) {
        await assert.rejects(authenticate(proof(response.token, 'submit', payload, changes)));
    }
    await assert.rejects(authenticate(proof(response.token, 'submit', payload), { ...identity, uid: 8 }));
    await assert.rejects(authenticate(proof(response.token, 'submit', payload), { ...identity, domainId: 'other' }));
    await assert.rejects(authenticate(proof(response.token, 'submit', payload), { ...identity, tid: new ObjectId() }));
    await assert.rejects(authenticate(proof(response.token, 'submit', payload), identity, { ...payload, code: 'changed' }));
    const encoded = proof(response.token, 'submit', payload);
    await authenticate(encoded);
    await assert.rejects(authenticate(encoded));
});

test('expiration, revocation, disabled service, version changes and key rotation reject submissions', async () => {
    for (const change of ['expired', 'revoked', 'disabled', 'version', 'keys']) {
        const f = fixture();
        const { response } = await f.start();
        if (change === 'expired') f.coll('proctor.session').rows[0].expiresAt = new Date(0);
        if (change === 'revoked') f.coll('proctor.session').rows[0].revoked = true;
        if (change === 'disabled') f.coll('proctor.config').rows[0].enabled = false;
        if (change === 'version') f.coll('proctor.config').rows[0].requiredVersion = '2.0.0';
        if (change === 'keys') f.coll('proctor.config').rows[0].keyId = 'c'.repeat(32);
        await assert.rejects(f.model.authenticate(identity, response.token, proof(response.token, 'submit', {}),
            'submit', '/d/exam/p/1/submit', {}));
    }
});

test('refresh rotates tokens exactly once and honors the refresh policy', async () => {
    const f = fixture();
    const { response } = await f.start();
    const session = f.coll('proctor.session').rows[0];
    const results = await Promise.allSettled([f.model.refresh(session, '203.0.113.8'), f.model.refresh(session, '203.0.113.8')]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.notEqual((results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<any>).value.token, response.token);
    assert.equal(f.coll('proctor.session').rows.find((row) => !row.revoked).ip, '203.0.113.8');
    await assert.rejects(f.model.authenticate(identity, response.token, proof(response.token, 'submit', {}),
        'submit', '/d/exam/p/1/submit', {}));
    f.coll('proctor.config').rows[0].refreshEnabled = false;
    await assert.rejects(f.model.refresh(f.coll('proctor.session').rows.find((row) => !row.revoked)));
});

test('one generation creates independent Ed25519 and RSA-3072 pairs, stores private keys with restrictive permissions and returns only public keys', async () => {
    const f = fixture();
    const keys = await f.model.generateKeys();
    const stored = JSON.parse([...f.files.values()][0]);
    assert.equal(createPublicKey(keys.signingPublicKey).asymmetricKeyType, 'ed25519');
    assert.equal(createPublicKey(keys.encryptionPublicKey).asymmetricKeyDetails?.modulusLength, 3072);
    assert.equal(createPrivateKey(stored.encryptionPrivateKey).asymmetricKeyType, 'rsa');
    assert.ok(cryptoHelpers.verifyPayload({ test: true }, cryptoHelpers.signedPayload({ test: true }, stored.signingPrivateKey), keys.signingPublicKey));
    assert.equal(stored.keyId, keys.keyId);
    assert.equal(f.coll('proctor.config').rows[0].keyId, keys.keyId);
    assert.equal(keys.signingPrivateKey, undefined);
    assert.equal(keys.encryptionPrivateKey, undefined);
    assert.equal(f.fileOps.find((op) => op[0] === 'mkdir')[2].mode, 0o700);
    assert.equal(f.fileOps.find((op) => op[0] === 'write')[1].mode, 0o600);
    assert.equal(f.fileOps.find((op) => op[0] === 'write')[1].flag, 'wx');
});

test('settings persist both switch states and numeric policies without trusting a client-supplied key ID', async () => {
    const f = fixture();
    const raw = { enabled: false, requiredVersion: ' 2.0.0 ', tokenTtlSeconds: 120,
        refreshEnabled: false, uploadGraceDays: 7, maxLogMiB: 32, keyId: 'c'.repeat(32) };
    await f.model.saveConfig(raw);
    const saved = await f.model.getConfig();
    assert.equal(saved.enabled, false);
    assert.equal(saved.refreshEnabled, false);
    assert.equal(saved.requiredVersion, '2.0.0');
    assert.equal(saved.tokenTtlSeconds, 120);
    assert.equal(saved.uploadGraceDays, 7);
    assert.equal(saved.maxLogMiB, 32);
    assert.equal(saved.keyId, serverKeys.keyId);
    await f.model.saveConfig({ ...raw, enabled: true, refreshEnabled: true });
    assert.equal((await f.model.getConfig()).enabled, true);
    assert.equal((await f.model.getConfig()).refreshEnabled, true);
    await f.model.checkContestConfig({ proctorEnabled: false, beginAt: new Date(Date.now() + 60000) }, true);
    await f.model.checkContestConfig(undefined, true);
});

test('problem reads require fresh GET proofs, matching version and an open contest attempt; POST proofs cannot substitute', async () => {
    const f = fixture();
    const { response } = await f.start();
    const path = '/d/exam/p/J0002';
    const payload = { tid: String(identity.tid), pid: 'J0002' };
    const readProof = (overrides: any = {}) => proof(response.token, 'problem_view', payload, { path, method: 'GET', ...overrides });
    const signed = readProof();
    await f.model.authenticateAccess(identity, response.token, signed, 'problem_view', path, payload);
    await assert.rejects(f.model.authenticateAccess(identity, response.token, signed, 'problem_view', path, payload), /already been used/);
    await assert.rejects(f.model.authenticateAccess(identity, response.token, readProof({ method: 'POST' }), 'problem_view', path, payload));
    await assert.rejects(f.model.authenticateAccess(identity, response.token, readProof(), 'problem_view', '/p/J0002', payload));
    await assert.rejects(f.model.authenticateAccess(identity, response.token, readProof(), 'problem_view', path, { ...payload, pid: '1' }));
    await assert.rejects(f.model.authenticateAccess({ ...identity, domainId: 'other' }, response.token, readProof(), 'problem_view', path, payload));
    await assert.rejects(f.model.authenticate(identity, response.token, readProof(), 'problem_view', path, payload));
    f.coll('proctor.config').rows[0].requiredVersion = '2.0.0';
    await assert.rejects(f.model.authenticateAccess(identity, response.token, readProof(), 'problem_view', path, payload), /version mismatch/);
    f.coll('proctor.config').rows[0].requiredVersion = '1.0.0';
    f.coll('proctor.attempt').rows[0].state = 'closing';
    await assert.rejects(f.model.authenticateAccess(identity, response.token, readProof(), 'problem_view', path, payload), /already finished/);
    f.coll('proctor.attempt').rows[0].state = 'open';
    f.coll('proctor.session').rows[0].expiresAt = new Date(Date.now() - 1);
    await assert.rejects(f.model.authenticateAccess(identity, response.token, readProof(), 'problem_view', path, payload), /expired/);
});

test('contest configuration gives actionable reasons and keeps started contests and missing-key settings fail-closed', async () => {
    const f = fixture();
    const raw = { enabled: true, requiredVersion: '1.0.0', tokenTtlSeconds: 300,
        refreshEnabled: true, uploadGraceDays: 30, maxLogMiB: 64 };
    const config = f.coll('proctor.config').rows[0];
    config.enabled = false;
    await assert.rejects(f.model.checkContestConfig(undefined, true),
        /Enable the proctor service in system settings first/);
    config.keyId = '';
    await assert.rejects(f.model.saveConfig(raw), /Generate authentication keys first/);
    assert.equal(config.enabled, false);
    await assert.rejects(f.model.saveConfig({ ...raw, enabled: 'true' }), /enabled/);
    await assert.rejects(f.model.saveConfig({ ...raw, tokenTtlSeconds: '300' }), /tokenTtlSeconds/);
    const unavailable = fixture({ missingKeys: true });
    unavailable.coll('proctor.config').rows[0].enabled = false;
    await assert.rejects(unavailable.model.saveConfig(raw), /Check the server key storage/);
    assert.equal((await unavailable.model.getConfig()).enabled, false);
    const started = { proctorEnabled: false, beginAt: new Date(Date.now() - 1000) };
    await assert.rejects(unavailable.model.checkContestConfig(started, true),
        /Proctor policy cannot change after the contest starts/);
    await assert.rejects(f.model.checkContestConfig(f.tdoc, false), /Proctor policy cannot change after the contest starts/);
});

test('automatic re-handshake preserves the original key and fingerprint binding and limits collected device data', async () => {
    const f = fixture();
    const { response } = await f.start();
    const other = generateKeyPairSync('ed25519');
    const raw = { ...f.raw, publicKey: other.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
    const c = await f.model.challenge(identity, f.tdoc, raw, 'https://oj.example');
    await assert.rejects(f.model.handshake(identity, c.payload.challengeId,
        cryptoHelpers.signedPayload(c.payload, other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())));
    const safe = await f.model.challenge(identity, f.tdoc, { ...f.raw, deviceInfo: { ...f.raw.deviceInfo, hostname: 'not-collected' } }, 'https://oj.example');
    assert.equal(safe.payload.deviceInfo.hostname, undefined);
    const resumed = await f.model.handshake(identity, safe.payload.challengeId, cryptoHelpers.signedPayload(safe.payload, clientPrivate), '203.0.113.9');
    assert.equal(resumed.payload.attemptId, response.payload.attemptId);
    assert.equal(f.coll('proctor.session').rows.at(-1).ip, '203.0.113.9');
});

test('legacy attempts can resume with the same registered key without maintaining a new client registry', async () => {
    const f = fixture();
    const deviceId = new ObjectId();
    const attemptId = new ObjectId();
    f.coll('proctor.device').rows.push({ _id: deviceId, uid: identity.uid, publicKey: clientPublic, revoked: false });
    f.coll('proctor.attempt').rows.push({ ...identity, _id: attemptId, deviceId, fingerprint, state: 'open' });
    const { response } = await f.start();
    assert.equal(response.payload.attemptId, attemptId.toHexString());
    assert.equal(f.coll('proctor.attempt').rows[0].publicKey, clientPublic);
    assert.equal(f.coll('proctor.attempt').rows[0].deviceId, undefined);
    assert.equal(f.coll('proctor.device').rows.length, 1);
});

test('finish blocks new submissions, waits for in-flight submissions and resumes upload after restart', async () => {
    const f = fixture();
    const { response } = await f.start();
    const session = f.coll('proctor.session').rows[0];
    const release = await f.model.reserveSubmission(session);
    await assert.rejects(f.model.closeAttempt(session));
    await assert.rejects(f.model.reserveSubmission(session));
    await release();
    const attempt = await f.model.closeAttempt(session);
    assert.equal(attempt.state, 'closing');
    assert.equal(f.statuses[0][3].proctorEnded, true);
    const challenge = await f.model.challenge(identity, f.tdoc, f.raw, 'https://oj.example');
    const resumed = await f.model.handshake(identity, challenge.payload.challengeId, cryptoHelpers.signedPayload(challenge.payload, clientPrivate));
    assert.equal(resumed.payload.attemptId, response.payload.attemptId);
    const changed = await f.model.challenge(identity, f.tdoc, { ...f.raw, fingerprint: 'c'.repeat(64) }, 'https://oj.example');
    await assert.rejects(f.model.handshake(identity, changed.payload.challengeId, cryptoHelpers.signedPayload(changed.payload, clientPrivate)));
});

test('pending final logs cannot qualify ended/flexible-duration contests; successful late logs qualify', () => {
    const { proctorRankingFilter } = cryptoHelpers;
    assert.deepEqual(proctorRankingFilter(false, true), {});
    const ended = proctorRankingFilter(true, true);
    assert.equal(matches({ proctorLogUploaded: false }, ended), false);
    assert.equal(matches({ proctorLogUploaded: true }, ended), true);
    const live = proctorRankingFilter(true, false, 1, 7200000);
    assert.equal(matches({ startAt: new Date(0) }, live), false);
    assert.equal(matches({ startAt: new Date(5000000) }, live), true);
    assert.equal(matches({ startAt: new Date(5000000), proctorEnded: true }, live), false);
    assert.equal(matches({ proctorLogUploaded: true }, live), true);
});

test('completed upload receipt remains recoverable after a lost response without issuing a new token', async () => {
    const f = fixture();
    await f.start();
    const logId = new ObjectId();
    Object.assign(f.coll('proctor.attempt').rows[0], { state: 'complete', logId });
    const c = await f.model.challenge(identity, f.tdoc, f.raw, 'https://oj.example');
    const response = await f.model.handshake(identity, c.payload.challengeId, cryptoHelpers.signedPayload(c.payload, clientPrivate));
    assert.equal(response.completed, true);
    assert.equal(response.receipt, logId.toHexString());
    assert.equal(response.token, undefined);
});

test('upload/delete locks serialize workers and stale cleanup cannot unlock a replacement', async () => {
    const f = fixture();
    const attemptId = new ObjectId();
    const lock = await f.model.acquireLogLock(attemptId);
    await assert.rejects(f.model.acquireLogLock(attemptId));
    await lock.assert();
    f.coll('proctor.lease').rows[0].expiresAt = new Date(0);
    const replacement = await f.model.acquireLogLock(attemptId);
    await assert.rejects(lock.assert());
    await lock.release();
    await replacement.assert();
    await replacement.release();
    assert.equal(f.coll('proctor.lease').rows.length, 0);
});

test('HTTPS reverse proxies use the configured public origin; remote HTTP is rejected but local development is allowed', () => {
    const { proctorOrigin } = cryptoHelpers;
    assert.equal(proctorOrigin('http://oj.example', 'oj.example', 'https://oj.example/'), 'https://oj.example');
    assert.equal(proctorOrigin('https://custom.example', 'custom.example', 'https://oj.example/'), 'https://custom.example');
    assert.equal(proctorOrigin('http://localhost:2333', 'localhost:2333', '/'), 'http://localhost:2333');
    assert.throws(() => proctorOrigin('http://oj.example', 'oj.example', '/'));
});
