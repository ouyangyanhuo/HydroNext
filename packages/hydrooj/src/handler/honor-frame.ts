import { readFile } from 'fs/promises';
import { escapeRegExp } from 'lodash';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { NotFoundError, UserNotFoundError, ValidationError } from '../error';
import { MAX_FRAME_BYTES, normalizeHonorFrameImage } from '../lib/honor-frame-image';
import { equipHonorFrame, grantHonorFrame, revokeHonorFrame } from '../lib/honor-frame-user';
import { PRIV } from '../model/builtin';
import { coll, framePath, publicFrame, resolveFrames } from '../model/honor-frame';
import * as oplog from '../model/oplog';
import storage from '../model/storage';
import user, { deleteUserCache } from '../model/user';
import { Handler, param, Types } from '../service/server';

export class ManageHonorFramesHandler extends Handler {
    noCheckPermView = true;

    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }

    @param('page', Types.PositiveInt, true)
    @param('uid', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(domainId: string, page = 1, uid?: number, q = '') {
        const query = q.trim() ? { name: { $regex: escapeRegExp(q.trim().slice(0, 80)), $options: 'i' } } : {};
        const count = await coll.countDocuments(query);
        const pageCount = Math.max(1, Math.ceil(count / 24));
        page = Math.min(page, pageCount);
        const docs = await coll.find(query).sort({ _id: -1 }).skip((page - 1) * 24).limit(24).toArray();
        const target = uid ? await user.coll.findOne({ _id: uid }) : null;
        if (uid && !target) throw new UserNotFoundError(uid);
        this.response.template = 'manage_honor_frames.html';
        this.response.body = {
            frames: docs.map((doc) => ({ ...publicFrame(doc), active: doc.active, createdAt: doc.createdAt })),
            page, pageCount, count, q,
            targetUser: target ? { _id: target._id, uname: target.uname, avatar: target.avatar } : null,
            grantedFrameIds: target?.honorFrameIds || [],
        };
    }

    @param('name', Types.String)
    async postUpload(domainId: string, name: string) {
        const title = name.trim();
        if (!title || title.length > 80) throw new ValidationError('name');
        const file = this.request.files.file;
        if (!file || file.size > MAX_FRAME_BYTES) throw new ValidationError('file');
        await this.limitRate('honor_frame_upload', 60, 10);
        let image: Buffer;
        try { image = normalizeHonorFrameImage(await readFile(file.filepath)); } catch {
            throw new ValidationError('file', null, 'Expected a transparent square PNG, 64–1024 px, up to 2 MiB.');
        }
        const _id = new ObjectId();
        const path = framePath(_id.toHexString());
        await storage.put(path, image, this.user._id);
        try {
            await coll.insertOne({ _id, name: title, active: false, createdAt: new Date(), createdBy: this.user._id });
        } catch (error) {
            await storage.del([path], this.user._id);
            throw error;
        }
        await oplog.log(this, 'honorFrame.upload', { frameId: _id.toHexString(), name: title });
        this.response.body = { ok: true };
    }

    @param('id', Types.ObjectId)
    @param('name', Types.String)
    @param('active', Types.Boolean)
    async postUpdate(domainId: string, id: ObjectId, name: string, active: boolean) {
        const title = name.trim();
        if (!title || title.length > 80) throw new ValidationError('name');
        const result = await coll.updateOne({ _id: id }, { $set: { name: title, active } });
        if (!result.matchedCount) throw new NotFoundError(id.toHexString());
        deleteUserCache(true);
        await oplog.log(this, 'honorFrame.update', { frameId: id.toHexString(), name: title, active });
        this.response.body = { ok: true };
    }

    @param('id', Types.ObjectId)
    @param('uid', Types.PositiveInt)
    async postGrant(domainId: string, id: ObjectId, uid: number) {
        await grantHonorFrame(uid, id.toHexString());
        await oplog.log(this, 'honorFrame.grant', { frameId: id.toHexString(), uid });
        this.response.body = { ok: true };
    }

    @param('id', Types.ObjectId)
    @param('uid', Types.PositiveInt)
    async postRevoke(domainId: string, id: ObjectId, uid: number) {
        await revokeHonorFrame(uid, id.toHexString());
        await oplog.log(this, 'honorFrame.revoke', { frameId: id.toHexString(), uid });
        this.response.body = { ok: true };
    }
}

export class HomeHonorFramesHandler extends Handler {
    noCheckPermView = true;

    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
    }

    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const doc = await user.coll.findOne({ _id: this.user._id });
        const ids = (doc?.honorFrameIds || []).filter((id) => /^[a-f0-9]{24}$/.test(id)).map((id) => new ObjectId(id));
        const query = { _id: { $in: ids }, active: true };
        const count = await coll.countDocuments(query);
        const pageCount = Math.max(1, Math.ceil(count / 12));
        page = Math.min(page, pageCount);
        const docs = await coll.find(query).sort({ _id: -1 }).skip((page - 1) * 12).limit(12).toArray();
        const equipped = doc?.honorFrameId;
        this.response.body = {
            frames: docs.map(publicFrame), count, page, pageCount,
            honorFrame: equipped ? (await resolveFrames([equipped]))[equipped] || null : null,
        };
    }

    @param('id', Types.String, true)
    async post(domainId: string, id = '') {
        await equipHonorFrame(this.user._id, id);
        const current = await user.getById(domainId, this.user._id);
        this.response.body = { ok: true, honorFrame: current.honorFrame };
    }
}

export class HonorFrameImageHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    @param('id', Types.ObjectId)
    async get(domainId: string, id: ObjectId) {
        const frame = await coll.findOne({ _id: id });
        if (!frame || (!frame.active && !this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM))) throw new NotFoundError(id.toHexString());
        this.response.body = await storage.get(framePath(id.toHexString()));
        this.response.type = 'image/png';
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Cache-Control', 'private, max-age=300');
    }
}

export async function apply(ctx: Context) {
    ctx.Route('manage_honor_frames', '/manage/honor-frames', ManageHonorFramesHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('home_honor_frames', '/home/honor-frames', HomeHonorFramesHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('honor_frame_image', '/honor-frame/:id.png', HonorFrameImageHandler);
}
