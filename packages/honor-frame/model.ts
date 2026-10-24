import { ObjectId } from 'mongodb';
import { Context, db } from 'hydrooj';
import { FRAME_THUMBNAIL_SIZES } from './lib/image';

export interface HonorFrameDoc {
    _id: ObjectId;
    name: string;
    nameKey?: string;
    description?: string;
    artworkHash?: string;
    active: boolean;
    createdAt: Date;
    createdBy: number;
    artworkVersion?: 2;
    artworkRevision?: string;
    thumbnailVersion?: 1;
    deleted?: boolean;
}

export interface PublicHonorFrame {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    circleImageUrl?: string;
    squareImageUrl?: string;
    artworkVersion?: 2;
}

declare module 'hydrooj' {
    interface Collections { 'honor.frame': HonorFrameDoc }
    interface Udoc {
        honorFrameIds?: string[];
        honorFrameId?: string;
    }
    interface BaseUser {
        honorFrame?: PublicHonorFrame | null;
    }
}

export const coll = db.collection('honor.frame');
export const framePath = (id: string, shape?: string, revision?: string, size?: number) => (
    `honor-frame/${id}${revision ? `-${revision}` : ''}${shape ? `-${shape}` : ''}${size ? `-${size}` : ''}.png`
);
export const frameAssetPaths = (frame: HonorFrameDoc) => {
    const id = frame._id.toHexString();
    const shapes = frame.artworkVersion === 2 ? ['square', 'circle'] : [undefined];
    return [undefined, ...(frame.thumbnailVersion === 1 ? FRAME_THUMBNAIL_SIZES : [])]
        .flatMap((size) => shapes.map((shape) => framePath(id, shape, frame.artworkRevision, size)));
};
export const publicFrame = (frame: HonorFrameDoc): PublicHonorFrame => ({
    id: frame._id.toHexString(), name: frame.name,
    imageUrl: `/honor-frame/${frame._id.toHexString()}.png${frame.artworkRevision ? `?v=${frame.artworkRevision}` : ''}`,
    description: frame.description || '',
    ...(frame.artworkVersion === 2 ? {
        artworkVersion: 2,
        circleImageUrl: `/honor-frame/${frame._id.toHexString()}/circle.png${frame.artworkRevision ? `?v=${frame.artworkRevision}` : ''}`,
        squareImageUrl: `/honor-frame/${frame._id.toHexString()}/square.png${frame.artworkRevision ? `?v=${frame.artworkRevision}` : ''}`,
    } : {}),
});

export async function resolveFrames(ids: string[]): Promise<Record<string, PublicHonorFrame>> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id)))];
    if (!unique.length) return {};
    const docs = await coll.find({ _id: { $in: unique.map((id) => new ObjectId(id)) }, active: true }).toArray();
    return Object.fromEntries(docs.map((doc) => [doc._id.toHexString(), publicFrame(doc)]));
}

export async function apply(ctx: Context) {
    // Legacy documents without these keys stay valid; new writes are protected
    // by the database even when two workers validate simultaneously.
    await coll.createIndexes(['nameKey', 'artworkHash'].map((key) => ({
        key: { [key]: 1 }, name: `unique_frame_${key}`, unique: true,
        partialFilterExpression: { [key]: { $type: 'string' } },
    })));
    await ctx.db.ensureIndexes(coll, { key: { active: 1, _id: -1 }, name: 'active_frames' });
    await ctx.db.ensureIndexes(db.collection('user'), { key: { honorFrameIds: 1, _id: 1 }, name: 'honor_frame_owners', sparse: true });
}
