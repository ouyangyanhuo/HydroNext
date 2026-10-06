import { ObjectId } from 'mongodb';
import { UserNotFoundError, ValidationError } from '../error';
import { coll as frames } from '../model/honor-frame';
import user, { deleteUserCache } from '../model/user';

export async function grantHonorFrame(uid: number, id: string) {
    if (!await frames.findOne({ _id: new ObjectId(id), active: true })) throw new ValidationError('honorFrame');
    const doc = await user.coll.findOneAndUpdate({ _id: uid },
        { $addToSet: { honorFrameIds: id } }, { returnDocument: 'after' });
    if (!doc) throw new UserNotFoundError(uid);
    deleteUserCache(doc);
}

export async function revokeHonorFrame(uid: number, id: string) {
    // Removing ownership and unequipping must be one atomic user update.
    const doc = await user.coll.findOneAndUpdate({ _id: uid }, [{
        $set: {
            honorFrameIds: { $setDifference: [{ $ifNull: ['$honorFrameIds', []] }, [id]] },
            honorFrameId: { $cond: [{ $eq: ['$honorFrameId', id] }, '', { $ifNull: ['$honorFrameId', ''] }] },
        },
    }], { returnDocument: 'after' });
    if (!doc) throw new UserNotFoundError(uid);
    deleteUserCache(doc);
}

export async function equipHonorFrame(uid: number, id: string) {
    if (id && (!/^[a-f0-9]{24}$/.test(id) || !await frames.findOne({ _id: new ObjectId(id), active: true }))) {
        throw new ValidationError('honorFrame');
    }
    // The ownership check belongs in the write filter, not a read-then-write.
    // This prevents a simultaneous revocation from being undone by equipping.
    const doc = await user.coll.findOneAndUpdate({ _id: uid, ...(id ? { honorFrameIds: id } : {}) },
        { $set: { honorFrameId: id } }, { returnDocument: 'after' });
    if (!doc) throw new ValidationError('honorFrame');
    deleteUserCache(doc);
}
