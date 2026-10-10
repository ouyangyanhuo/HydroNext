import { escapeRegExp } from 'lodash';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { ForbiddenError, NotFoundError, ValidationError } from '../error';
import {
    activeUpdateAssets, buildUpdateManifest, defaultDraft, inspectUpdateFile, normalizeUpdateDraft,
    UPDATE_KINDS, UPDATE_URL_FIELDS, UpdateKind, updateUrl, updateUrlAssetId, updateVersion, verifyUpdateStream,
} from '../lib/client-update';
import { hashFile } from '../lib/proctor-log';
import { PRIV } from '../model/builtin';
import * as updates from '../model/client-update';
import * as oplog from '../model/oplog';
import storage from '../model/storage';
import system from '../model/system';
import { Handler, param, requireSudo, Types } from '../service/server';

function publishedOrigin(config: Awaited<ReturnType<typeof updates.getSettings>>, fallback = '') {
    if (config.publishedOrigin) return config.publishedOrigin;
    // Legacy manifests only had uploaded assets; do not confuse their origin with a newly edited draft.
    const url = [config.manifest?.hotUpdate?.asarUrl, config.manifest?.config?.url,
        config.manifest?.fullUpdate?.installerUrl, config.manifest?.fullUpdate?.portableUrl].find((value) => updateUrlAssetId(value));
    return url ? new URL(url).origin : config.draft?.origin || fallback;
}

export class ManageClientUpdatesHandler extends Handler {
    noCheckPermView = true;

    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        this.response.addHeader('Cache-Control', 'no-store');
        if (this.request.headers.origin) {
            try {
                if (new URL(this.request.headers.origin).host === this.request.host) return;
            } catch { /* Reject malformed origins. */ }
            throw new ForbiddenError();
        }
    }

    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(_, page = 1, q = '') {
        const config = await updates.getSettings();
        let origin = '';
        try { origin = updateUrl(system.get('server.url') || this.context.origin, true); } catch { /* An administrator can supply the public origin. */ }
        const draft = { ...defaultDraft, origin, ...config.draft };
        q = q.trim().slice(0, 80);
        const search = { $regex: escapeRegExp(q), $options: 'i' };
        const filter = { _id: { $nin: (config.deletedAssets || []).map((id) => new ObjectId(id)) },
            ...(q ? { $or: [{ filename: search }, { version: search }] } : {}) };
        const count = await updates.assets.countDocuments(filter);
        const pageCount = Math.max(1, Math.ceil(count / 25));
        page = Math.min(page, pageCount);
        const rows = await updates.assets.find(filter).sort({ uploadedAt: -1, _id: -1 }).skip((page - 1) * 25).limit(25).toArray();
        const selectedIds = UPDATE_KINDS.map((kind) => draft[kind])
            .filter((id) => id && !config.deletedAssets?.includes(id)).map((id) => new ObjectId(id));
        const selected = selectedIds.length ? await updates.assets.find({ _id: { $in: selectedIds } }).toArray() : [];
        const publicRows = rows.map(updates.publicAsset);
        this.response.template = 'manage_client_updates.html';
        this.response.body = { draft, revision: config.revision, manifest: config.manifest || null, publishedAssets: config.publishedAssets || [],
            activeAssets: activeUpdateAssets(config.manifest),
            publishedOrigin: publishedOrigin(config, draft.origin),
            publishedAt: config.publishedAt || null, assets: publicRows, selectedAssets: selected.map(updates.publicAsset), count, page, pageCount, q };
    }

    @requireSudo
    async postAuthorize() {
        this.response.body = { ok: true };
    }

    // UI authorizes BEFORE sending multipart files; sudo cannot replay uploaded files.
    async postUpload() {
        if (!this.session.sudo || Date.now() - this.session.sudo >= 3600000) throw new ForbiddenError('Authorization required.');
        await this.limitRate('client_update_upload', 60, 10);
        const kind = this.args.kind as UpdateKind;
        if (!UPDATE_KINDS.includes(kind)) throw new ValidationError('kind');
        const file = this.request.files?.file;
        if (!file) throw new ValidationError('file');
        const expected = kind === 'asar' ? '.asar' : kind === 'config' ? '.json' : '.exe';
        if (!file.originalFilename?.toLowerCase().endsWith(expected)) throw new ValidationError('file');
        let version: string;
        let inspected: Awaited<ReturnType<typeof inspectUpdateFile>>;
        try {
            version = updateVersion(this.args.version);
            inspected = await inspectUpdateFile(file.filepath, kind, file.size, version);
        } catch (error) { throw new ValidationError('file', null, error.message); }
        const sha256 = await hashFile(file.filepath);
        const id = new ObjectId();
        const filename = kind === 'config' ? 'exam-config.json' : kind === 'asar' ? 'app.asar' : `${kind}-${version}.exe`;
        const path = `client-update/${id.toHexString()}/${filename}`;
        try {
            await storage.put(path, file.filepath, this.user._id);
            const asset: updates.Asset = { _id: id, kind, version, filename, path, size: file.size, sha256,
                ...inspected, uploadedAt: new Date(), uploadedBy: this.user._id };
            await updates.assets.insertOne(asset);
            this.response.body = { ok: true, asset: updates.publicAsset(asset) };
        } catch (error) {
            await storage.del([path], this.user._id);
            throw error;
        }
        await oplog.log(this, 'client-update.upload', { id, kind, version, sha256 });
    }

    @requireSudo
    async postSave() {
        await this.write(false);
    }

    @requireSudo
    async postPublish() {
        await this.write(true);
    }

    @requireSudo
    @param('id', Types.ObjectId)
    async postDelete(_, id: ObjectId) {
        const current = await updates.getSettings();
        if (!Number.isSafeInteger(this.args.revision) || this.args.revision !== current.revision) {
            throw new ValidationError('revision', null, 'Update settings changed. Reload before saving.');
        }
        const key = id.toHexString();
        if (activeUpdateAssets(current.manifest).includes(key)) {
            throw new ValidationError('id', null, 'This package is used by the published release. Publish a replacement before deleting it.');
        }
        const asset = await updates.assets.findOne({ _id: id });
        if (!asset || current.deletedAssets?.includes(key)) throw new NotFoundError('package');
        const draft = { ...defaultDraft, ...current.draft };
        for (const kind of UPDATE_KINDS) if (draft[kind] === key) draft[kind] = '';
        for (const field of [...Object.values(UPDATE_URL_FIELDS), 'asarFallbackUrl', 'configFallbackUrl'] as const) {
            if (updateUrlAssetId(draft[field]) === key) draft[field] = '';
        }
        // Publish and delete share the same compare-and-swap revision, including cleanup failures.
        const result = await updates.settings.updateOne({ _id: 'settings', revision: current.revision }, {
            $set: { draft }, $inc: { revision: 1 }, $addToSet: { deletedAssets: key, cleanupAssets: key }, $pull: { publishedAssets: key },
        });
        if (!result.modifiedCount) throw new ValidationError('revision', null, 'Update settings changed. Reload before saving.');
        await oplog.log(this, 'client-update.delete', { id, filename: asset.filename, version: asset.version });
        let cleanupPending = false;
        try {
            await updates.cleanupDeletedAssets(key);
        } catch { cleanupPending = true; }
        this.response.body = { ok: true, deletedId: key, revision: current.revision + 1, cleanupPending,
            publishedAssets: (current.publishedAssets || []).filter((value) => value !== key) };
    }

    private async write(publish: boolean) {
        const current = await updates.getSettings();
        if (!Number.isSafeInteger(this.args.revision) || this.args.revision !== current.revision) {
            throw new ValidationError('revision', null, 'Update settings changed. Reload before saving.');
        }
        let draft: ReturnType<typeof normalizeUpdateDraft>;
        let manifest: Record<string, any>;
        let publishedIds: string[] = [];
        const date = new Date();
        try {
            draft = normalizeUpdateDraft(this.args.draft);
            const ids = UPDATE_KINDS.map((kind) => draft[kind]).filter(Boolean);
            const localReferences = [...UPDATE_KINDS.map((kind) => ({ kind, url: draft[UPDATE_URL_FIELDS[kind]] })),
                { kind: 'asar', url: draft.asarFallbackUrl }, { kind: 'config', url: draft.configFallbackUrl }]
                .filter(({ url }) => url && new URL(url).origin === draft.origin && updateUrlAssetId(url));
            publishedIds = [...new Set([...ids, ...localReferences.map(({ url }) => updateUrlAssetId(url)!)])];
            if (publishedIds
                .some((id) => id && current.deletedAssets?.includes(id))) throw new Error('Invalid update package.');
            const rows = publishedIds.length ? await updates.assets.find({ _id: { $in: publishedIds.map((id) => new ObjectId(id)) } }).toArray() : [];
            manifest = buildUpdateManifest(draft, rows.map(updates.publicAsset), date.toISOString());
            for (const { kind, url } of localReferences) {
                const row = rows.find((asset) => asset._id.toHexString() === updateUrlAssetId(url) && asset.kind === kind);
                if (!row || new URL(url).pathname !== `/client-updates/packages/${row._id.toHexString()}/${encodeURIComponent(row.filename)}`
                    || (kind !== 'config' && row.version !== draft.version)) throw new Error('Invalid update package.');
                if (kind === 'asar' && manifest.hotUpdate
                    && (row.size !== manifest.hotUpdate.size || row.sha256 !== manifest.hotUpdate.sha256)) {
                    throw new Error('External ASAR URLs require a valid size (bytes) and SHA-256.');
                }
            }
            if (publish) {
                await this.limitRate('client_update_publish', 60, 5);
                if (!UPDATE_KINDS.some((kind) => draft[kind] || draft[UPDATE_URL_FIELDS[kind]])) throw new Error('Choose at least one update package.');
                if (rows.some((asset) => asset.bundleError)) throw new Error(rows.find((asset) => asset.bundleError).bundleError);
                if ((await Promise.all(rows.map((asset) => storage.exists(asset.path)))).some((exists) => !exists)) throw new Error('Update package file is missing.');
                await Promise.all(rows.map(async (asset) => verifyUpdateStream(await storage.get(asset.path), asset)));
            }
        } catch (error) { throw new ValidationError('draft', null, error.message); }
        const result = await updates.settings.updateOne({ _id: 'settings', revision: current.revision }, {
            $set: { draft, ...(publish ? { manifest, publishedAt: date, publishedOrigin: draft.origin } : {}) }, $inc: { revision: 1 },
            ...(publish ? { $addToSet: { publishedAssets: { $each: publishedIds } } } : {}),
        });
        if (!result.modifiedCount) throw new ValidationError('revision', null, 'Update settings changed. Reload before saving.');
        await oplog.log(this, publish ? 'client-update.publish' : 'client-update.save', { version: draft.version, buildVersion: draft.buildVersion });
        this.response.body = { ok: true, revision: current.revision + 1, draft, preview: manifest,
            activeAssets: activeUpdateAssets(publish ? manifest : current.manifest),
            manifest: publish ? manifest : current.manifest || null, publishedAt: publish ? date : current.publishedAt || null,
            publishedOrigin: publish ? draft.origin : publishedOrigin(current),
            publishedAssets: [...new Set([...(current.publishedAssets || []), ...(publish ? publishedIds : [])])] };
    }
}

export class ClientUpdateManifestHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get() {
        const config = await updates.settings.findOne({ _id: 'settings' });
        if (!config?.manifest) throw new NotFoundError('version.json');
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'no-store');
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        // A Buffer prevents UI context injection and HTML/SPA rendering.
        this.response.body = Buffer.from(JSON.stringify(config.manifest, null, 2));
    }
}

export class ClientUpdatePackageHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    @param('id', Types.ObjectId)
    @param('filename', Types.String)
    async get(_, id: ObjectId, filename: string) {
        const asset = await updates.assets.findOne({ _id: id });
        if (!asset || asset.filename !== filename || !await storage.exists(asset.path)) throw new NotFoundError('package');
        const config = await updates.settings.findOne({ _id: 'settings' });
        if (config?.deletedAssets?.includes(id.toHexString()) || !config?.publishedAssets?.includes(id.toHexString())) {
            throw new NotFoundError('package');
        }
        this.response.type = asset.kind === 'config' ? 'application/json' : 'application/octet-stream';
        this.response.addHeader('Cache-Control', 'public, max-age=31536000, immutable');
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Content-Length', String(asset.size));
        this.response.body = await storage.get(asset.path);
    }
}

export function apply(ctx: Context) {
    ctx.Route('manage_client_updates', '/manage/client-updates', ManageClientUpdatesHandler);
    ctx.Route('client_update_manifest', '/client-updates/version.json', ClientUpdateManifestHandler);
    ctx.Route('client_update_package', '/client-updates/packages/:id/:filename', ClientUpdatePackageHandler);
}
