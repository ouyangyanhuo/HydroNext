import { generateKeyPairSync } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { ForbiddenError, ValidationError } from '../error';
import { Tdoc } from '../interface';
import {
    canonical, decodeProof, digest, normalizeClientKey, PROCTOR_PROTOCOL, secret, signedPayload, validProof, verifyPayload,
} from '../lib/proctor';
import db from '../service/db';
import * as contest from './contest';

interface Config {
    _id: string;
    enabled: boolean;
    requiredVersion: string;
    tokenTtlSeconds: number;
    refreshEnabled: boolean;
    uploadGraceDays: number;
    maxLogMiB: number;
    keyId: string;
}
interface Identity { uid: number, domainId: string, tid: ObjectId }
export interface DeviceInfo { platform?: string, osVersion?: string, arch?: string }
interface Challenge extends Identity {
    _id: string; publicKey: string; fingerprint: string; version: string; deviceInfo: DeviceInfo;
    expiresAt: Date; payload: Record<string, any>;
}
interface Attempt extends Identity {
    _id: ObjectId; publicKey: string; fingerprint: string; createdAt: Date;
    deviceId?: ObjectId; // Read-only compatibility with the previous enrollment protocol.
    state: 'open' | 'closing' | 'complete'; finishedAt?: Date; logId?: ObjectId;
}
export interface Session extends Identity {
    _id: string; attemptId: ObjectId; publicKey: string; fingerprint: string; version: string;
    keyId: string; ip: string; deviceInfo: DeviceInfo; createdAt: Date; expiresAt: Date; revoked: boolean;
}
export interface ProctorLog extends Identity {
    _id: ObjectId; attemptId: ObjectId; filename: string; username: string; uploadedAt: Date;
    size: number; path: string; sha256: string; contestTitle: string; domainName: string;
}
interface Expiring { _id: string, expiresAt: Date, attemptId?: ObjectId, holder?: string }
declare module '../service/db' {
    interface Collections {
        'proctor.config': Config;
        // Legacy records are read only when upgrading an existing contest attempt.
        'proctor.device': { _id: ObjectId, uid: number, publicKey: string, revoked: boolean };
        'proctor.challenge': Challenge;
        'proctor.attempt': Attempt;
        'proctor.session': Session;
        'proctor.nonce': Expiring;
        'proctor.lease': Expiring;
        'proctor.log': ProctorLog;
    }
}
export const configColl = db.collection('proctor.config');
export const challenges = db.collection('proctor.challenge');
export const attempts = db.collection('proctor.attempt');
export const sessions = db.collection('proctor.session');
export const nonces = db.collection('proctor.nonce');
export const leases = db.collection('proctor.lease');
export const logs = db.collection('proctor.log');

const defaults: Config = { _id: 'config', enabled: false, requiredVersion: '1.0.0', tokenTtlSeconds: 300,
    refreshEnabled: true, uploadGraceDays: 30, maxLogMiB: 64, keyId: '' };
const keyDir = () => process.env.HYDRO_PROCTOR_KEY_DIR || join(homedir(), '.hydro', 'proctor-keys');

export async function getConfig(): Promise<Config> {
    return { ...defaults, ...await configColl.findOne({ _id: 'config' }) };
}

export async function getKeys(keyId: string) {
    if (!/^[a-f0-9]{32}$/.test(keyId)) throw new ForbiddenError('Generate authentication keys first.');
    try {
        return JSON.parse(await readFile(join(keyDir(), `${keyId}.json`), 'utf8')) as {
            keyId: string; signingPrivateKey: string; signingPublicKey: string; encryptionPrivateKey: string; encryptionPublicKey: string;
        };
    } catch {
        throw new ForbiddenError('Proctor authentication keys are unavailable. Check the server key storage.');
    }
}

export const publicKeys = (keys: Awaited<ReturnType<typeof getKeys>>) => ({
    keyId: keys.keyId, signingPublicKey: keys.signingPublicKey, encryptionPublicKey: keys.encryptionPublicKey,
});

export async function generateKeys() {
    const signing = generateKeyPairSync('ed25519');
    const encryption = generateKeyPairSync('rsa', { modulusLength: 3072 });
    const keyId = digest(secret()).slice(0, 32);
    const keys = { keyId,
        signingPrivateKey: signing.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        signingPublicKey: signing.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        encryptionPrivateKey: encryption.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        encryptionPublicKey: encryption.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
    await mkdir(keyDir(), { recursive: true, mode: 0o700 });
    await writeFile(join(keyDir(), `${keyId}.json`), JSON.stringify(keys), { mode: 0o600, flag: 'wx' });
    await configColl.updateOne({ _id: 'config' }, { $set: { keyId } }, { upsert: true });
    return publicKeys(keys);
}

export async function saveConfig(raw: Partial<Config>) {
    const config = await getConfig();
    const version = typeof raw.requiredVersion === 'string' ? raw.requiredVersion.trim() : '';
    if (!version || !/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(version)) throw new ValidationError('requiredVersion');
    for (const [key, min, max] of [['tokenTtlSeconds', 60, 1800], ['uploadGraceDays', 1, 365], ['maxLogMiB', 1, 256]] as const) {
        if (!Number.isSafeInteger(raw[key]) || raw[key] < min || raw[key] > max) throw new ValidationError(key);
    }
    if (typeof raw.enabled !== 'boolean' || typeof raw.refreshEnabled !== 'boolean') throw new ValidationError('enabled');
    if (raw.enabled) await getKeys(config.keyId);
    await configColl.updateOne({ _id: 'config' }, { $set: {
        enabled: raw.enabled, requiredVersion: version, tokenTtlSeconds: raw.tokenTtlSeconds,
        refreshEnabled: raw.refreshEnabled, uploadGraceDays: raw.uploadGraceDays, maxLogMiB: raw.maxLogMiB,
    } }, { upsert: true });
}

export async function checkContestConfig(tdoc: Tdoc | undefined, enabled: boolean) {
    if (tdoc && !!tdoc.proctorEnabled !== enabled && Date.now() >= tdoc.beginAt.getTime()) {
        throw new ForbiddenError('Proctor policy cannot change after the contest starts.');
    }
    if (enabled) {
        const config = await getConfig();
        if (!config.enabled) throw new ForbiddenError('Enable the proctor service in system settings first.');
        await getKeys(config.keyId);
    }
}

export async function challenge(identity: Identity, tdoc: Tdoc, raw: any, origin: string) {
    const config = await getConfig();
    if (!config.enabled || !tdoc.proctorEnabled) throw new ForbiddenError('Proctor is not configured.');
    if (raw.version !== config.requiredVersion) throw new ForbiddenError('Proctor client version mismatch.');
    if (!/^[a-f0-9]{64}$/.test(raw.fingerprint || '') || !/^[A-Za-z0-9_-]{32,100}$/.test(raw.clientNonce || '')) {
        throw new ValidationError('fingerprint');
    }
    if (Date.now() < tdoc.beginAt.getTime() || Date.now() > tdoc.endAt.getTime() + config.uploadGraceDays * 86400000) {
        throw new ForbiddenError('Proctor session is outside the permitted time window.');
    }
    let publicKey: string;
    try {
        publicKey = normalizeClientKey(raw.publicKey);
    } catch {
        throw new ValidationError('publicKey');
    }
    const deviceInfo: DeviceInfo = {};
    if (raw.deviceInfo !== undefined && (!raw.deviceInfo || typeof raw.deviceInfo !== 'object' || Array.isArray(raw.deviceInfo))) {
        throw new ValidationError('deviceInfo');
    }
    for (const key of ['platform', 'osVersion', 'arch'] as const) {
        const value = raw.deviceInfo?.[key];
        if (value === undefined) continue;
        if (typeof value !== 'string' || value.length > 128 || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
            throw new ValidationError('deviceInfo');
        }
        deviceInfo[key] = value;
    }
    const keys = await getKeys(config.keyId);
    const _id = secret();
    const expiresAt = new Date(Date.now() + 120000);
    const payload = { protocol: PROCTOR_PROTOCOL, action: 'handshake', challengeId: _id, origin,
        uid: identity.uid, domainId: identity.domainId, tid: identity.tid.toHexString(), keyId: config.keyId,
        clientNonce: raw.clientNonce, serverNonce: secret(), publicKey, fingerprint: raw.fingerprint,
        version: raw.version, deviceInfo, expiresAt: expiresAt.toISOString() };
    await challenges.insertOne({ ...identity, _id, publicKey, fingerprint: raw.fingerprint, version: raw.version, deviceInfo, expiresAt, payload });
    return { payload, signature: signedPayload(payload, keys.signingPrivateKey) };
}

async function issueSession(identity: Omit<Session, '_id' | 'expiresAt' | 'revoked' | 'createdAt'>, config: Config) {
    const token = secret();
    const expiresAt = new Date(Date.now() + config.tokenTtlSeconds * 1000);
    const session = { ...identity, _id: digest(token), createdAt: new Date(), expiresAt, revoked: false };
    await sessions.insertOne(session);
    const payload = { protocol: PROCTOR_PROTOCOL, action: 'session', tokenHash: session._id,
        attemptId: identity.attemptId.toHexString(), uid: identity.uid, domainId: identity.domainId,
        tid: identity.tid.toHexString(), version: identity.version, fingerprint: identity.fingerprint,
        keyId: identity.keyId, expiresAt: expiresAt.toISOString(), refreshEnabled: config.refreshEnabled };
    const keys = await getKeys(config.keyId);
    return { token, payload, signature: signedPayload(payload, keys.signingPrivateKey) };
}

export async function handshake(identity: Identity, challengeId: string, signature: string, ip = '') {
    const config = await getConfig();
    const doc = await challenges.findOne({ ...identity, _id: challengeId, expiresAt: { $gt: new Date() } });
    if (!config.enabled || !doc || doc.version !== config.requiredVersion || doc.payload.keyId !== config.keyId
        || !verifyPayload(doc.payload, signature, doc.publicKey)) throw new ForbiddenError('Invalid proctor handshake.');
    if (!await challenges.findOneAndDelete({ ...identity, _id: challengeId, expiresAt: { $gt: new Date() } })) {
        throw new ForbiddenError('Proctor challenge has already been used.');
    }
    const attempt = await attempts.findOneAndUpdate(identity, { $setOnInsert: { ...identity, _id: new ObjectId(),
        publicKey: doc.publicKey, fingerprint: doc.fingerprint, createdAt: new Date(), state: 'open' } }, { upsert: true, returnDocument: 'after' });
    if (!attempt.publicKey && attempt.deviceId) {
        const legacy = await db.collection('proctor.device').findOne({ _id: attempt.deviceId, uid: identity.uid, revoked: false });
        if (legacy?.publicKey === doc.publicKey && attempt.fingerprint === doc.fingerprint) {
            await attempts.updateOne({ _id: attempt._id, publicKey: { $exists: false } }, {
                $set: { publicKey: doc.publicKey }, $unset: { deviceId: '' },
            });
            attempt.publicKey = doc.publicKey;
        }
    }
    if (attempt.publicKey !== doc.publicKey || attempt.fingerprint !== doc.fingerprint) {
        throw new ForbiddenError('Proctor environment mismatch.');
    }
    if (attempt.state === 'complete') {
        return { completed: true, receipt: attempt.logId?.toHexString() };
    }
    return issueSession({ ...identity, attemptId: attempt._id, publicKey: doc.publicKey, fingerprint: doc.fingerprint,
        version: doc.version, keyId: config.keyId, deviceInfo: doc.deviceInfo || {}, ip: ip.slice(0, 128) }, config);
}

export async function authenticate(
    identity: Identity, token: string, proof: string, action: string, path: string, payload: unknown, method: 'POST' | 'GET' = 'POST',
) {
    const config = await getConfig();
    if (!config.enabled || typeof token !== 'string' || token.length > 100) throw new ForbiddenError('Proctor authentication required.');
    const session = await sessions.findOne({ ...identity, _id: digest(token), revoked: false, expiresAt: { $gt: new Date() } });
    if (!session || !session.publicKey || session.version !== config.requiredVersion || session.keyId !== config.keyId) {
        throw new ForbiddenError('Proctor session expired or client version mismatch.');
    }
    let parsed: ReturnType<typeof decodeProof>;
    try {
        parsed = decodeProof(proof);
    } catch {
        throw new ForbiddenError('Invalid proctor request proof.');
    }
    if (!validProof(parsed.payload, { action, method, path, tokenHash: session._id,
        fingerprint: session.fingerprint, version: session.version, payloadHash: digest(canonical(payload)) })
    || !verifyPayload(parsed.payload, parsed.signature, session.publicKey)) throw new ForbiddenError('Invalid proctor request proof.');
    try {
        await nonces.insertOne({ _id: digest(`${session._id}:${parsed.payload.nonce}`), expiresAt: new Date(Date.now() + 180000) });
    } catch (error) {
        if (error.code === 11000) throw new ForbiddenError('Proctor request has already been used.');
        throw error;
    }
    return session;
}

export async function authenticateAccess(identity: Identity, token: string, proof: string, action: string, path: string, payload: unknown) {
    const session = await authenticate(identity, token, proof, action, path, payload, 'GET');
    const attempt = await attempts.findOne({ ...identity, _id: session.attemptId, state: 'open', fingerprint: session.fingerprint });
    if (!attempt) throw new ForbiddenError('Proctor session is already finished.');
    return session;
}

export async function refresh(session: Session, ip = session.ip) {
    const config = await getConfig();
    if (!config.refreshEnabled) throw new ForbiddenError('Proctor session refresh is disabled.');
    const result = await sessions.updateOne({ _id: session._id, revoked: false }, { $set: { revoked: true } });
    if (!result.modifiedCount) throw new ForbiddenError('Proctor session has already been refreshed.');
    const { _id, expiresAt, revoked, createdAt, ...identity } = session;
    return issueSession({ ...identity, ip: ip.slice(0, 128) }, config);
}

export async function reserveSubmission(session: Session) {
    const _id = secret();
    await leases.insertOne({ _id, attemptId: session.attemptId, expiresAt: new Date(Date.now() + 300000) });
    const result = await attempts.updateOne({ _id: session.attemptId, state: 'open', fingerprint: session.fingerprint }, {
        $set: { state: 'open' },
    });
    if (!result.matchedCount) {
        await leases.deleteOne({ _id });
        throw new ForbiddenError('Proctor session is already finished.');
    }
    let lost = false;
    let released = false;
    let renewing: Promise<void> | null = null;
    const timer = setInterval(() => {
        if (released || renewing) return;
        renewing = leases.updateOne({ _id, expiresAt: { $gt: new Date() } }, {
            $set: { expiresAt: new Date(Date.now() + 300000) },
        }).then((value) => {
            if (!value.matchedCount) lost = true;
        }).catch(() => {
            lost = true;
        }).finally(() => {
            renewing = null;
        });
    }, 30000);
    timer.unref();
    const release = async () => {
        released = true;
        clearInterval(timer);
        await renewing;
        await leases.deleteOne({ _id });
    };
    return Object.assign(release, {
        async assert() {
            if (lost || !await leases.findOne({ _id, expiresAt: { $gt: new Date() } })) {
                throw new ForbiddenError('Proctor submission lease expired. Please retry.');
            }
        },
    });
}

export async function closeAttempt(session: Session) {
    const attempt = await attempts.findOneAndUpdate({ _id: session.attemptId, state: { $ne: 'complete' } }, {
        $set: { state: 'closing', finishedAt: new Date() },
    }, { returnDocument: 'after' });
    if (!attempt) throw new ForbiddenError('Proctor session is already finished.');
    await contest.setStatus(session.domainId, session.tid, session.uid, { proctorEnded: true });
    if (await leases.countDocuments({ attemptId: attempt._id, expiresAt: { $gt: new Date() } })) {
        throw new ForbiddenError('Wait for pending submissions before finishing proctoring.');
    }
    return attempt;
}

// Serialize evidence changes across workers. Stale cleanup cannot release a
// replacement owner's lock after a process failure / lease expiry.
export async function acquireLogLock(attemptId: ObjectId) {
    const _id = `log:${attemptId.toHexString()}`;
    const holder = secret();
    const expiresAt = new Date(Date.now() + 15 * 60000);
    await leases.findOneAndDelete({ _id, expiresAt: { $lte: new Date() } });
    try {
        await leases.insertOne({ _id, holder, expiresAt });
    } catch (error) {
        if (error.code === 11000) throw new ForbiddenError('Proctor log is busy. Please retry.');
        throw error;
    }
    return {
        async assert() {
            if (!await leases.findOne({ _id, holder, expiresAt: { $gt: new Date() } })) {
                throw new ForbiddenError('Proctor log operation timed out. Please retry.');
            }
        },
        release: () => leases.deleteOne({ _id, holder }),
    };
}

export async function apply(ctx: Context) {
    const ttl = { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'expiry' } as const;
    await Promise.all([ctx.db.ensureIndexes(challenges, ttl),
        ctx.db.ensureIndexes(sessions, ttl), ctx.db.ensureIndexes(nonces, ttl), ctx.db.ensureIndexes(leases, ttl)]);
    await ctx.db.ensureIndexes(attempts, { key: { domainId: 1, tid: 1, uid: 1 }, unique: true, name: 'contest_attempt' });
    await ctx.db.ensureIndexes(logs, { key: { uploadedAt: -1 }, name: 'recent_logs' },
        { key: { attemptId: 1 }, unique: true, name: 'final_log' });
}
