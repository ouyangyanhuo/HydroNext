import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { UpdateAsset, UpdateDraft } from '../lib/client-update';
import db from '../service/db';
import storage from './storage';

export interface Asset extends Omit<UpdateAsset, 'id'> {
    _id: ObjectId; path: string; uploadedAt: Date; uploadedBy: number;
}
interface Settings {
    _id: string;
    revision: number;
    draft: UpdateDraft;
    manifest?: Record<string, any>;
    publishedAssets?: string[];
    publishedAt?: Date;
    deletedAssets?: string[];
    cleanupAssets?: string[];
}
declare module '../service/db' {
    interface Collections {
        'client-update.asset': Asset;
        'client-update.settings': Settings;
    }
}
export const assets = db.collection('client-update.asset');
export const settings = db.collection('client-update.settings');
export const publicAsset = ({ path, _id, ...asset }: Asset): UpdateAsset & { uploadedAt: Date, uploadedBy: number } => (
    { ...asset, id: _id.toHexString() }
);

export async function getSettings() {
    await settings.updateOne({ _id: 'settings' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
    return settings.findOne({ _id: 'settings' });
}

// The settings tombstone is an outbox: failed file cleanup is retried after restart.
export async function cleanupDeletedAssets(preferredId?: string) {
    const config = await settings.findOne({ _id: 'settings' });
    if (!config?.cleanupAssets?.length) return;
    const queued = preferredId ? config.cleanupAssets.filter((id) => id === preferredId) : config.cleanupAssets.slice(0, 25);
    if (!queued.length) return;
    const ids = queued.map((id) => new ObjectId(id));
    const rows = await assets.find({ _id: { $in: ids } }).toArray();
    await storage.del(rows.map((asset) => asset.path));
    await assets.deleteMany({ _id: { $in: ids } });
    await settings.updateOne({ _id: 'settings' }, { $pull: { cleanupAssets: { $in: ids.map((id) => id.toHexString()) } } });
}

export async function apply(ctx: Context) {
    await assets.createIndex({ uploadedAt: -1, _id: -1 });
    ctx.interval(() => cleanupDeletedAssets().catch((error) => console.error('Client update file cleanup failed:', error)), 60000);
}
