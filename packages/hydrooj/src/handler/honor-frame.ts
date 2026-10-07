import { readFile } from 'fs/promises';
import { escapeRegExp } from 'lodash';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { NotFoundError, UserNotFoundError, ValidationError } from '../error';
import { assertUniqueFrame, frameArtworkHash, frameDuplicateError, frameNameKey, readArtwork } from '../lib/honor-frame-catalog';
import { MAX_FRAME_BYTES, normalizeHonorFrameImage } from '../lib/honor-frame-image';
import { equipHonorFrame, grantHonorFrame, manageHonorFrameOwners, revokeHonorFrame } from '../lib/honor-frame-user';
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
        const query = { deleted: { $ne: true }, ...(q.trim() ? { name: { $regex: escapeRegExp(q.trim().slice(0, 80)), $options: 'i' } } : {}) };
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
    @param('description', Types.String, true)
    async postUpload(domainId: string, name: string, description = '') {
        const title = name.normalize('NFKC').trim();
        if (!title || title.length > 80) throw new ValidationError('name');
        if (description.length > 2000) throw new ValidationError('description');
        const { square, circle } = this.request.files;
        for (const [shape, file] of Object.entries({ square, circle })) {
            if (!file) throw new ValidationError(shape, null, 'Upload both rounded square and circular artwork.');
            if (file.size > MAX_FRAME_BYTES) throw new ValidationError(shape, null, 'Choose a PNG or WebP file no larger than 2 MiB.');
        }
        await this.limitRate('honor_frame_upload', 60, 10);
        const warnings: string[] = [];
        const images = await Promise.all([square, circle].map(async (file, i) => {
            const shape = i ? 'circle' : 'square';
            try {
                return normalizeHonorFrameImage(await readFile(file.filepath), shape, (message) => warnings.push(message));
            } catch (error) {
                const message = error instanceof Error ? error.message : '';
                const hint = message.includes('dimensions') || message.includes('512') ? 'Frame artwork must be 512 × 512 px.'
                    : message.includes('transparent') ? 'Frame must contain transparent and visible pixels'
                        : 'Invalid PNG artwork. Please export a new PNG or WebP image.';
                throw new ValidationError(shape, null, hint);
            }
        }));
        const artworkHash = frameArtworkHash(images);
        await assertUniqueFrame(title, artworkHash);
        const _id = new ObjectId();
        const paths = ['square', 'circle'].map((shape) => framePath(_id.toHexString(), shape));
        try {
            await storage.put(paths[0], images[0], this.user._id);
            await storage.put(paths[1], images[1], this.user._id);
            await coll.insertOne({ _id, name: title, nameKey: frameNameKey(title), description: description.trim(), artworkHash,
                active: false, artworkVersion: 2, createdAt: new Date(), createdBy: this.user._id });
        } catch (error) {
            await storage.del(paths, this.user._id);
            throw frameDuplicateError(error);
        }
        await oplog.log(this, 'honorFrame.upload', { frameId: _id.toHexString(), name: title });
        this.response.body = { ok: true, warnings };
    }

    @param('id', Types.ObjectId)
    @param('name', Types.String)
    @param('description', Types.String)
    async postEdit(domainId: string, id: ObjectId, name: string, description: string) {
        const title = name.normalize('NFKC').trim();
        if (!title || title.length > 80) throw new ValidationError('name');
        if (description.length > 2000) throw new ValidationError('description');
        const frame = await coll.findOne({ _id: id, deleted: { $ne: true } });
        if (!frame) throw new NotFoundError(id.toHexString());
        const { square, circle } = this.request.files || {};
        const warnings: string[] = [];
        const changes: Partial<typeof frame> = { name: title, nameKey: frameNameKey(title), description: description.trim() };
        const value = id.toHexString();
        let paths: string[] = [];
        if (square || circle) {
            if (frame.artworkVersion !== 2 && (!square || !circle)) {
                throw new ValidationError('file', null, 'Replacing legacy artwork requires both shapes.');
            }
            for (const [shape, file] of Object.entries({ square, circle })) {
                if (file && file.size > MAX_FRAME_BYTES) {
                    throw new ValidationError(shape, null, 'Choose a PNG or WebP file no larger than 2 MiB.');
                }
            }
            await this.limitRate('honor_frame_upload', 60, 10);
            const images = await Promise.all([square, circle].map(async (file, i) => {
                const shape = i ? 'circle' : 'square';
                if (!file) return readArtwork(framePath(value, shape, frame.artworkRevision));
                try {
                    return normalizeHonorFrameImage(await readFile(file.filepath), shape, (message) => warnings.push(message));
                } catch (error) {
                    const message = error instanceof Error ? error.message : '';
                    const hint = message.includes('dimensions') || message.includes('512') ? 'Frame artwork must be 512 × 512 px.'
                        : message.includes('transparent') ? 'Frame must contain transparent and visible pixels'
                            : 'Invalid PNG artwork. Please export a new PNG or WebP image.';
                    throw new ValidationError(shape, null, hint);
                }
            }));
            changes.artworkHash = frameArtworkHash(images);
            await assertUniqueFrame(title, changes.artworkHash, id);
            changes.artworkVersion = 2;
            changes.artworkRevision = new ObjectId().toHexString();
            paths = ['square', 'circle'].map((shape) => framePath(value, shape, changes.artworkRevision));
            try {
                // Stage both assets under fresh paths; never overwrite the live pair.
                await storage.put(paths[0], images[0], this.user._id);
                await storage.put(paths[1], images[1], this.user._id);
            } catch (error) {
                await storage.del(paths, this.user._id);
                throw error;
            }
        } else await assertUniqueFrame(title, undefined, id);
        try {
            const result = await coll.updateOne({
                _id: id, deleted: { $ne: true },
                artworkRevision: frame.artworkRevision || { $exists: false },
            }, { $set: changes });
            if (!result.matchedCount) throw new ValidationError('id', null, 'This frame changed. Refresh and try again.');
        } catch (error) {
            if (paths.length) await storage.del(paths, this.user._id);
            throw frameDuplicateError(error);
        }
        deleteUserCache(true);
        if (paths.length) {
            const previous = frame.artworkVersion === 2
                ? ['square', 'circle'].map((shape) => framePath(value, shape, frame.artworkRevision)) : [framePath(value)];
            try { await storage.del(previous, this.user._id); } catch {
                warnings.push('Saved, but old artwork cleanup failed.');
            }
        }
        await oplog.log(this, 'honorFrame.edit', { frameId: value, name: title, artworkChanged: !!paths.length });
        this.response.body = { ok: true, warnings };
    }

    @param('id', Types.ObjectId)
    async postDelete(domainId: string, id: ObjectId) {
        let frame = await coll.findOne({ _id: id });
        if (frame) {
            // Hide and block re-publication first. A failed cleanup is retryable.
            await coll.updateOne({ _id: id }, { $set: { active: false, deleted: true } });
            // An edit may have committed after the initial read, before deletion.
            frame = await coll.findOne({ _id: id });
            if (!frame) {
                this.response.body = { ok: true };
                return;
            }
            deleteUserCache(true);
            const value = id.toHexString();
            await user.coll.updateMany({ $or: [{ honorFrameIds: value }, { honorFrameId: value }] }, [{ $set: {
                honorFrameIds: { $setDifference: [{ $ifNull: ['$honorFrameIds', []] }, [value]] },
                honorFrameId: { $cond: [{ $eq: ['$honorFrameId', value] }, '', { $ifNull: ['$honorFrameId', ''] }] },
            } }]);
            deleteUserCache(true);
            await storage.del(frame.artworkVersion === 2
                ? ['square', 'circle'].map((shape) => framePath(value, shape, frame.artworkRevision)) : [framePath(value)], this.user._id);
            await coll.deleteOne({ _id: id, deleted: true });
            await oplog.log(this, 'honorFrame.delete', { frameId: value, name: frame.name });
        }
        this.response.body = { ok: true };
    }

    @param('id', Types.ObjectId)
    @param('name', Types.String)
    async postRename(domainId: string, id: ObjectId, name: string) {
        const title = name.normalize('NFKC').trim();
        if (!title || title.length > 80) throw new ValidationError('name');
        await assertUniqueFrame(title, undefined, id);
        let result;
        try {
            result = await coll.updateOne({ _id: id, deleted: { $ne: true } }, { $set: { name: title, nameKey: frameNameKey(title) } });
        } catch (error) { throw frameDuplicateError(error); }
        if (!result.matchedCount) throw new NotFoundError(id.toHexString());
        deleteUserCache(true);
        await oplog.log(this, 'honorFrame.rename', { frameId: id.toHexString(), name: title });
        this.response.body = { ok: true };
    }

    @param('id', Types.ObjectId)
    @param('description', Types.String)
    async postDescription(domainId: string, id: ObjectId, description: string) {
        if (description.length > 2000) throw new ValidationError('description');
        const result = await coll.updateOne({ _id: id, deleted: { $ne: true } }, { $set: { description: description.trim() } });
        if (!result.matchedCount) throw new NotFoundError(id.toHexString());
        deleteUserCache(true);
        await oplog.log(this, 'honorFrame.description', { frameId: id.toHexString() });
        this.response.body = { ok: true };
    }

    @param('id', Types.ObjectId)
    @param('active', Types.Boolean)
    async postStatus(domainId: string, id: ObjectId, active: boolean) {
        const result = await coll.updateOne({ _id: id, deleted: { $ne: true } }, { $set: { active } });
        if (!result.matchedCount) throw new NotFoundError(id.toHexString());
        deleteUserCache(true);
        await oplog.log(this, 'honorFrame.status', { frameId: id.toHexString(), active });
        this.response.body = { ok: true };
    }

    @param('id', Types.ObjectId)
    @param('uids', Types.NumericArray)
    @param('action', Types.Range(['grant', 'revoke', 'equip', 'unequip']))
    async postOwners(domainId: string, id: ObjectId, uids: number[], action: 'grant' | 'revoke' | 'equip' | 'unequip') {
        const result = await manageHonorFrameOwners(id.toHexString(), uids, action);
        await oplog.log(this, `honorFrame.${action}`, { frameId: id.toHexString(), uids, ...result });
        this.response.body = { ok: true, ...result };
    }

    @param('id', Types.ObjectId)
    @param('name', Types.String)
    @param('active', Types.Boolean)
    async postUpdate(domainId: string, id: ObjectId, name: string, active: boolean) {
        const title = name.normalize('NFKC').trim();
        if (!title || title.length > 80) throw new ValidationError('name');
        await assertUniqueFrame(title, undefined, id);
        let result;
        try {
            result = await coll.updateOne({ _id: id, deleted: { $ne: true } }, { $set: { name: title, nameKey: frameNameKey(title), active } });
        } catch (error) { throw frameDuplicateError(error); }
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
        this.response.template = 'home_honor_frames.html';
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
    @param('shape', Types.Range(['circle', 'square']), true)
    async get(domainId: string, id: ObjectId, shape?: 'circle' | 'square') {
        const frame = await coll.findOne({ _id: id });
        if (!frame || frame.deleted || (!frame.active && !this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)
            && !await user.coll.findOne({ honorFrameIds: id.toHexString() }, { projection: { _id: 1 } }))) {
            throw new NotFoundError(id.toHexString());
        }
        this.response.body = await storage.get(framePath(
            id.toHexString(), frame.artworkVersion === 2 ? shape || 'square' : undefined, frame.artworkRevision,
        ));
        this.response.type = 'image/png';
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Cache-Control', 'private, max-age=300');
    }
}

export class UploadHonorFrameHandler extends Handler {
    noCheckPermView = true;

    async prepare() { this.checkPriv(PRIV.PRIV_EDIT_SYSTEM); }
    @param('id', Types.ObjectId, true)
    async get(domainId: string, id?: ObjectId) {
        const frame = id ? await coll.findOne({ _id: id, deleted: { $ne: true } }) : null;
        if (id && !frame) throw new NotFoundError(id.toHexString());
        this.response.template = 'manage_honor_frame_upload.html';
        this.response.body = { frame: frame ? publicFrame(frame) : null };
    }
}

function userSearch(q: string) {
    const text = q.trim().slice(0, 80);
    return text ? { $or: [{ uname: { $regex: escapeRegExp(text), $options: 'i' } },
        ...(Number.isSafeInteger(Number(text)) && Number(text) > 0 ? [{ _id: Number(text) }] : [])] } : {};
}

export class HonorFrameSearchHandler extends Handler {
    noCheckPermView = true;

    async prepare() { this.checkPriv(PRIV.PRIV_EDIT_SYSTEM); }
    @param('q', Types.String, true)
    @param('kind', Types.Range(['users', 'frames']))
    @param('frame', Types.ObjectId, true)
    @param('uids', Types.NumericArray, true)
    async get(domainId: string, q = '', kind: 'users' | 'frames' = 'frames', frame?: ObjectId, uids?: number[]) {
        if (kind === 'frames') {
            const docs = await coll.find({ deleted: { $ne: true }, name: { $regex: escapeRegExp(q.trim().slice(0, 80)), $options: 'i' } })
                .sort({ _id: -1 }).limit(50).toArray();
            this.response.body = { options: docs.map((doc) => ({ value: doc._id.toHexString(), label: doc.name, disabled: !doc.active })) };
        } else {
            if (uids && (!uids.length || uids.length > 50 || uids.some((uid) => !Number.isSafeInteger(uid) || uid <= 0))) {
                throw new ValidationError('uids');
            }
            const docs = await user.coll.find({ $and: [{ _id: { $gt: 0 } }, uids ? { _id: { $in: uids } } : userSearch(q)] })
                .project({ _id: 1, uname: 1, ...(frame ? { honorFrameIds: 1 } : {}) }).sort({ _id: 1 }).limit(50).toArray();
            this.response.body = { options: docs.map((doc) => ({ value: String(doc._id), label: `${doc.uname} (#${doc._id})`,
                owned: !!frame && !!doc.honorFrameIds?.includes(frame.toHexString()) })) };
        }
    }
}

export class HonorFrameOwnersHandler extends Handler {
    noCheckPermView = true;

    async prepare() { this.checkPriv(PRIV.PRIV_EDIT_SYSTEM); }
    @param('id', Types.ObjectId)
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(domainId: string, id: ObjectId, page = 1, q = '') {
        const frame = await coll.findOne({ _id: id });
        if (!frame || frame.deleted) throw new NotFoundError(id.toHexString());
        const query = { honorFrameIds: id.toHexString(), ...userSearch(q) };
        const count = await user.coll.countDocuments(query);
        const pageCount = Math.max(1, Math.ceil(count / 25));
        page = Math.min(page, pageCount);
        const owners = await user.coll.find(query).project({ _id: 1, uname: 1, avatar: 1, honorFrameId: 1 })
            .sort({ _id: 1 }).skip((page - 1) * 25).limit(25).toArray();
        this.response.template = 'manage_honor_frame_owners.html';
        this.response.body = {
            frame: { ...publicFrame(frame), active: frame.active }, page, pageCount, count, q,
            owners: owners.map(({ honorFrameId, ...doc }) => ({ ...doc, equipped: honorFrameId === id.toHexString() && frame.active })),
        };
    }
}

export class UserHonorFramesHandler extends Handler {
    @param('uid', Types.PositiveInt)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, uid: number, page = 1) {
        const target = await user.coll.findOne({ _id: uid }, { projection: { honorFrameIds: 1 } });
        if (!target) throw new UserNotFoundError(uid);
        const ids = (target.honorFrameIds || []).filter((id) => /^[a-f0-9]{24}$/.test(id)).map((id) => new ObjectId(id));
        const query = { _id: { $in: ids }, deleted: { $ne: true } };
        const count = await coll.countDocuments(query);
        const pageCount = Math.max(1, Math.ceil(count / 12));
        page = Math.min(page, pageCount);
        const docs = await coll.find(query).sort({ _id: -1 }).skip((page - 1) * 12).limit(12).toArray();
        this.response.body = { frames: docs.map((doc) => ({ ...publicFrame(doc), active: doc.active })), page, pageCount, count };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('manage_honor_frames', '/manage/honor-frames', ManageHonorFramesHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('manage_honor_frame_upload', '/manage/honor-frames/upload', UploadHonorFrameHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('manage_honor_frame_search', '/manage/honor-frames/search', HonorFrameSearchHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('manage_honor_frame_owners', '/manage/honor-frames/:id/owners', HonorFrameOwnersHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('home_honor_frames', '/home/honor-frames', HomeHonorFramesHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('honor_frame_image', '/honor-frame/:id.png', HonorFrameImageHandler);
    ctx.Route('honor_frame_shape_image', '/honor-frame/:id/:shape.png', HonorFrameImageHandler);
    ctx.Route('user_honor_frames', '/user/:uid/honor-frames', UserHonorFramesHandler);
}
