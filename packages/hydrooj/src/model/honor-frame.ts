import { ObjectId } from 'mongodb';
import { Context } from '../context';
import db from '../service/db';

export interface HonorFrameDoc {
    _id: ObjectId;
    name: string;
    active: boolean;
    createdAt: Date;
    createdBy: number;
}

export interface PublicHonorFrame {
    id: string;
    name: string;
    imageUrl: string;
}

declare module '../service/db' {
    interface Collections { 'honor.frame': HonorFrameDoc }
}

export const coll = db.collection('honor.frame');
export const framePath = (id: string) => `honor-frame/${id}.png`;
export const publicFrame = (frame: HonorFrameDoc): PublicHonorFrame => ({
    id: frame._id.toHexString(), name: frame.name, imageUrl: `/honor-frame/${frame._id.toHexString()}.png`,
});

export async function resolveFrames(ids: string[]): Promise<Record<string, PublicHonorFrame>> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id)))];
    if (!unique.length) return {};
    const docs = await coll.find({ _id: { $in: unique.map((id) => new ObjectId(id)) }, active: true }).toArray();
    return Object.fromEntries(docs.map((doc) => [doc._id.toHexString(), publicFrame(doc)]));
}

export async function apply(ctx: Context) {
    await ctx.db.ensureIndexes(coll, { key: { active: 1, _id: -1 }, name: 'active_frames' });
}
