import { PassThrough, Readable, Writable } from 'stream';
import { ZipWriter } from '@zip.js/zip.js';
import { escapeRegExp } from 'lodash';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { ForbiddenError, NotFoundError, ValidationError } from '../error';
import { PROCTOR_PROTOCOL, proctorOrigin, signedPayload } from '../lib/proctor';
import { hashFile, validateEncryptedLog } from '../lib/proctor-log';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import * as oplog from '../model/oplog';
import problem from '../model/problem';
import * as proctor from '../model/proctor';
import storage from '../model/storage';
import system from '../model/system';
import { Handler, param, requireSudo, Types } from '../service/server';
import { ContestDetailBaseHandler } from './contest';

function checkOrigin(request: Handler['request']) {
    if (!request.headers.origin) return;
    try {
        if (new URL(request.headers.origin).host === request.host) return;
    } catch { /* Malformed origins fail closed, rather than causing a server error. */ }
    throw new ForbiddenError('Invalid proctor request origin.');
}

async function listLogs(page: number, q: string, pageSize: number) {
    if (![25, 50].includes(pageSize)) throw new ValidationError('pageSize');
    q = q.trim().slice(0, 80);
    const regex = { $regex: escapeRegExp(q), $options: 'i' };
    const filter = q ? { $or: [{ filename: regex }, { username: regex }, { domainId: regex }, { contestTitle: regex }] } : {};
    const count = await proctor.logs.countDocuments(filter);
    const pageCount = Math.max(1, Math.ceil(count / pageSize));
    page = Math.min(page, pageCount);
    const docs = await proctor.logs.find(filter).sort({ uploadedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
    return { logs: docs.map(({ path, sha256, attemptId, ...doc }) => doc), count, page, pageCount, pageSize, q };
}

export class ManageProctorHandler extends Handler {
    noCheckPermView = true;

    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        checkOrigin(this.request);
        this.response.addHeader('Cache-Control', 'no-store');
    }

    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(_, page = 1, q = '', pageSize = 25) {
        const config = await proctor.getConfig();
        let keys = null;
        if (config.keyId) {
            try { keys = proctor.publicKeys(await proctor.getKeys(config.keyId)); } catch { /* A missing volume must not lock out recovery. */ }
        }
        this.response.template = 'manage_proctor.html';
        this.response.body = { config, keys, ...await listLogs(page, q, pageSize) };
    }

    @requireSudo
    async postSave() {
        await proctor.saveConfig(this.args);
        await oplog.log(this, 'proctor.settings', {});
        this.response.body = { ok: true, config: await proctor.getConfig() };
    }

    @requireSudo
    async postGenerateKeys() {
        await this.limitRate('proctor_keys', 60, 2);
        this.response.body = { keys: await proctor.generateKeys() };
        await oplog.log(this, 'proctor.keys', { keyId: this.response.body.keys.keyId });
    }

    @requireSudo
    async postRevealKeys() {
        await this.limitRate('proctor_private_keys', 60, 3);
        try {
            proctorOrigin(this.context.origin, this.request.host, system.get('server.url'));
        } catch (error) {
            throw new ForbiddenError(error.message);
        }
        const config = await proctor.getConfig();
        this.response.addHeader('Cache-Control', 'no-store');
        const keys = await proctor.getKeys(config.keyId);
        await oplog.log(this, 'proctor.keys.view', { keyId: keys.keyId });
        this.response.body = { privateKeys: { keyId: keys.keyId,
            signingPrivateKey: keys.signingPrivateKey, encryptionPrivateKey: keys.encryptionPrivateKey } };
    }
}

export class ManageProctorLogsHandler extends Handler {
    noCheckPermView = true;

    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        checkOrigin(this.request);
        this.response.addHeader('Cache-Control', 'no-store');
    }

    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    @param('pageSize', Types.PositiveInt, true)
    async get(_, page = 1, q = '', pageSize = 25) {
        this.response.template = 'manage_proctor_logs.html';
        this.response.body = await listLogs(page, q, pageSize);
    }

    private async selected() {
        const ids = this.args.ids;
        if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id))) {
            throw new ValidationError('ids');
        }
        const unique = [...new Set<string>(ids)];
        const docs = await proctor.logs.find({ _id: { $in: unique.map((id) => new ObjectId(id)) } }).toArray();
        if (docs.length !== unique.length) throw new NotFoundError('log');
        return docs;
    }

    async postDownload() {
        const docs = await this.selected();
        if (docs.length === 1) {
            this.binary(await storage.get(docs[0].path), docs[0].filename);
            return;
        }
        // Stream the archive; never load multiple log files into server memory.
        const output = new PassThrough();
        const controller = new AbortController();
        output.once('close', () => controller.abort());
        const zip = new ZipWriter(Writable.toWeb(output) as WritableStream, { signal: controller.signal });
        this.binary(output, 'proctor-logs.zip');
        void (async () => {
            for (const doc of docs) {
                // eslint-disable-next-line no-await-in-loop
                const stream = await storage.get(doc.path);
                // eslint-disable-next-line no-await-in-loop
                await zip.add(`${doc._id.toHexString()}-${doc.filename}`, Readable.toWeb(stream) as ReadableStream);
            }
            await zip.close();
        })().catch((error) => output.destroy(error));
    }

    @requireSudo
    async postDelete() {
        const docs = await this.selected();
        const locks: Awaited<ReturnType<typeof proctor.acquireLogLock>>[] = [];
        try {
            for (const doc of [...docs].sort((a, b) => a.attemptId.toHexString().localeCompare(b.attemptId.toHexString()))) {
            // eslint-disable-next-line no-await-in-loop
                locks.push(await proctor.acquireLogLock(doc.attemptId));
            }
            // Removing evidence also removes qualification. Original judge records remain.
            for (const doc of docs) {
            // eslint-disable-next-line no-await-in-loop
                await contest.setStatus(doc.domainId, doc.tid, doc.uid, { proctorLogUploaded: false, proctorEnded: true });
                // eslint-disable-next-line no-await-in-loop
                await proctor.attempts.updateOne({ _id: doc.attemptId }, { $set: { state: 'closing' }, $unset: { logId: '' } });
            }
            await storage.del(docs.map((doc) => doc.path), this.user._id);
            await Promise.all(locks.map((lock) => lock.assert()));
            await proctor.logs.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } });
            await oplog.log(this, 'proctor.logs.delete', { ids: docs.map((doc) => doc._id) });
            this.response.body = { ok: true };
        } finally {
            await Promise.all(locks.map((lock) => lock.release()));
        }
    }
}

export class ContestProctorHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectId)
    async prepare(domainId: string, _tid: ObjectId) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        this.checkPerm(PERM.PERM_VIEW_CONTEST);
        if (domainId !== this.domain._id || !this.tsdoc?.attend || !this.tdoc.proctorEnabled) throw new ForbiddenError();
        const config = await proctor.getConfig();
        if (Date.now() > this.tdoc.endAt.getTime() + config.uploadGraceDays * 86400000) throw new ForbiddenError();
        checkOrigin(this.request);
        this.response.addHeader('Cache-Control', 'no-store');
    }

    private identity() {
        return { uid: this.user._id, domainId: this.domain._id, tid: this.tdoc.docId };
    }

    private authenticate(action: string, payload: unknown) {
        return proctor.authenticate(this.identity(), this.request.headers['x-proctor-token'] as string,
            this.request.headers['x-proctor-proof'] as string, action,
            (this.context.originalPath || this.request.path).split('?')[0], payload);
    }

    async get() {
        const attempt = await proctor.attempts.findOne(this.identity());
        const log = attempt?.logId ? await proctor.logs.findOne({ _id: attempt.logId }) : null;
        this.response.body = { state: attempt?.state || 'not_started', logUploaded: !!log,
            receipt: log ? { id: log._id, filename: log.filename, uploadedAt: log.uploadedAt, sha256: log.sha256 } : null };
    }

    async postChallenge() {
        await this.limitRate('proctor_handshake', 60, 10);
        let origin: string;
        try {
            origin = proctorOrigin(this.context.origin, this.request.host, system.get('server.url'));
        } catch (error) {
            throw new ForbiddenError(error.message);
        }
        this.response.body = await proctor.challenge(this.identity(), this.tdoc, this.args, origin);
    }

    @param('challengeId', Types.String)
    @param('signature', Types.String)
    async postHandshake(_, challengeId: string, signature: string) {
        await this.limitRate('proctor_handshake', 60, 10);
        this.response.body = await proctor.handshake(this.identity(), challengeId, signature, this.request.ip);
    }

    async postRefresh() {
        const session = await this.authenticate('refresh', {});
        this.response.body = await proctor.refresh(session, this.request.ip);
    }

    async postFinish() {
        const session = await this.authenticate('finish', {});
        await proctor.closeAttempt(session);
        this.response.body = { state: 'closing', logUploaded: false };
    }

    async postUpload() {
        await this.limitRate('proctor_log_upload', 60, 5);
        const config = await proctor.getConfig();
        if (Date.now() > this.tdoc.endAt.getTime() + config.uploadGraceDays * 86400000) throw new ForbiddenError();
        const file = this.request.files?.file;
        if (!file || file.size < 100 || file.size > config.maxLogMiB * 1024 * 1024) throw new ValidationError('file');
        const filename = file.originalFilename;
        if (!filename || !/^[\p{L}\p{N}_. -]{1,120}\.hplog$/u.test(filename)) throw new ValidationError('filename');
        const sha256 = await hashFile(file.filepath);
        const session = await this.authenticate('upload', { filename, size: file.size, sha256 });
        const lock = await proctor.acquireLogLock(session.attemptId);
        try {
            const existing = await proctor.logs.findOne({ attemptId: session.attemptId });
            if (existing && await storage.exists(existing.path)) {
                if (existing.sha256 !== sha256) throw new ForbiddenError('Final proctor log cannot be replaced.');
                await proctor.attempts.updateOne({ _id: session.attemptId }, { $set: { state: 'complete', logId: existing._id } });
                await contest.setStatus(session.domainId, session.tid, session.uid, { proctorLogUploaded: true, proctorEnded: true });
                this.response.body = { ok: true, receipt: existing._id };
                return;
            }
            if (existing) {
                // Recover a partially deleted file without qualifying missing evidence.
                await proctor.logs.deleteOne({ _id: existing._id });
                await proctor.attempts.updateOne({ _id: session.attemptId }, { $set: { state: 'closing' }, $unset: { logId: '' } });
                await contest.setStatus(session.domainId, session.tid, session.uid, { proctorLogUploaded: false, proctorEnded: true });
            }
            try {
                await validateEncryptedLog(file.filepath, proctor.getKeys);
            } catch {
                throw new ValidationError('file', null, 'Invalid encrypted proctor log.');
            }
            const attempt = await proctor.closeAttempt(session);
            const _id = new ObjectId();
            const path = `proctor-log/${_id.toHexString()}.hplog`;
            try {
                await storage.put(path, file.filepath, this.user._id);
                await lock.assert();
                await proctor.logs.insertOne({ ...this.identity(), _id, attemptId: attempt._id, filename, username: this.user.uname,
                    uploadedAt: new Date(), size: file.size, path, sha256, contestTitle: this.tdoc.title, domainName: this.domain.name });
            } catch (error) {
                await storage.del([path], this.user._id);
                throw error;
            }
            await proctor.attempts.updateOne({ _id: attempt._id }, { $set: { state: 'complete', logId: _id } });
            await contest.setStatus(session.domainId, session.tid, session.uid, { proctorLogUploaded: true, proctorEnded: true });
            this.response.body = { ok: true, receipt: _id };
        } finally {
            await lock.release();
        }
    }
}

// Signed login context for the native client. Renderer state and usernames must
// never authorize turning off machine restrictions. Root requires PRIV_ALL.
export class ProctorIdentityHandler extends Handler {
    @param('clientNonce', Types.String)
    @param('tid', Types.ObjectId, true)
    @param('problem', Types.Name, true)
    async post(domainId: string, clientNonce: string, tid?: ObjectId, routePid = '') {
        checkOrigin(this.request);
        this.response.addHeader('Cache-Control', 'no-store');
        await this.limitRate('proctor_identity', 60, 120);
        if (domainId !== this.domain._id || !/^[A-Za-z0-9_-]{43}$/.test(clientNonce)) throw new ForbiddenError();
        const config = await proctor.getConfig();
        const keys = await proctor.getKeys(config.keyId);
        const root = this.user._id > 0 && this.user.hasPriv(PRIV.PRIV_ALL);
        let pid = 0;
        let proctorEnabled = false;
        if (tid && this.user._id) {
            this.checkPriv(PRIV.PRIV_USER_PROFILE);
            this.checkPerm(PERM.PERM_VIEW_CONTEST);
            const tdoc = await contest.get(domainId, tid);
            const status = await contest.getStatus(domainId, tid, this.user._id);
            if (!tdoc || (!status?.attend && !root)) throw new ForbiddenError('Attend the contest before starting proctoring.');
            proctorEnabled = !!tdoc.proctorEnabled;
            if (routePid) {
                const pdoc = await problem.get(domainId, routePid);
                if (!pdoc || !tdoc.pids.includes(pdoc.docId)) throw new ForbiddenError('Problem is outside the contest.');
                pid = pdoc.docId;
            }
        }
        const origin = proctorOrigin(`${this.context.protocol}://${this.request.host}`, this.request.host, system.get('server.url'));
        const payload = { protocol: PROCTOR_PROTOCOL, action: 'identity', keyId: keys.keyId, origin,
            clientNonce, uid: this.user._id || 0, domainId: this.domain._id, root,
            tid: tid?.toHexString() || '', routePid, pid, proctorEnabled, expiresAt: new Date(Date.now() + 60000).toISOString() };
        this.response.body = { payload, signature: signedPayload(payload, keys.signingPrivateKey) };
    }
}

export function apply(ctx: Context) {
    ctx.Route('proctor_identity', '/proctor/identity', ProctorIdentityHandler);
    ctx.Route('manage_proctor', '/manage/proctor', ManageProctorHandler);
    ctx.Route('manage_proctor_logs', '/manage/proctor/logs', ManageProctorLogsHandler);
    ctx.Route('contest_proctor', '/contest/:tid/proctor', ContestProctorHandler, PERM.PERM_VIEW_CONTEST);
}
