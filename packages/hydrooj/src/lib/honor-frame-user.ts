import { ObjectId } from 'mongodb';
import { UserNotFoundError, ValidationError } from '../error';
import { coll as frames } from '../model/honor-frame';
import user, { deleteUserCache } from '../model/user';

async function checkFrameAfterWrite(id: string, uids: number[]) {
    const frame = await frames.findOne({ _id: new ObjectId(id) });
    if (frame && !frame.deleted) return;
    // A grant/equip that already passed its read can race with global deletion.
    // Repair that late write without disturbing a different equipped frame.
    await user.coll.updateMany({ _id: { $in: uids } }, [{ $set: {
        honorFrameIds: { $setDifference: [{ $ifNull: ['$honorFrameIds', []] }, [id]] },
        honorFrameId: { $cond: [{ $eq: ['$honorFrameId', id] }, '', { $ifNull: ['$honorFrameId', ''] }] },
    } }]);
    deleteUserCache(true);
    throw new ValidationError('honorFrame');
}

export async function grantHonorFrame(uid: number, id: string) {
    if (!await frames.findOne({ _id: new ObjectId(id), active: true })) throw new ValidationError('honorFrame');
    const doc = await user.coll.findOneAndUpdate({ _id: uid, honorFrameIds: { $ne: id } },
        { $addToSet: { honorFrameIds: id } }, { returnDocument: 'after' });
    if (!doc) {
        if (await user.coll.findOne({ _id: uid }, { projection: { _id: 1 } })) {
            throw new ValidationError('uids', null, 'Some selected users already own this avatar frame.');
        }
        throw new UserNotFoundError(uid);
    }
    await checkFrameAfterWrite(id, [uid]);
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
    if (id) await checkFrameAfterWrite(id, [uid]);
    deleteUserCache(doc);
}

export async function manageHonorFrameOwners(id: string, input: number[], action: 'grant' | 'revoke' | 'equip' | 'unequip') {
    if (!Array.isArray(input) || !input.length || input.length > 50
        || input.some((uid) => !Number.isSafeInteger(uid) || uid <= 0)) throw new ValidationError('uids');
    const uids = [...new Set(input)];
    const frame = await frames.findOne({ _id: new ObjectId(id) });
    if (!frame || frame.deleted || (['grant', 'equip'].includes(action) && !frame.active)) throw new ValidationError('honorFrame');
    const query = { _id: { $in: uids }, ...(action === 'grant' ? {} : { honorFrameIds: id }) };
    if (await user.coll.countDocuments(query) !== uids.length) throw new ValidationError('uids');
    if (action === 'grant') {
        if (await user.coll.countDocuments({ _id: { $in: uids }, honorFrameIds: id })) {
            throw new ValidationError('uids', null, 'Some selected users already own this avatar frame.');
        }
    }
    const update = action === 'grant' ? { $addToSet: { honorFrameIds: id } }
        : action === 'equip' ? { $set: { honorFrameId: id } }
            : [{ $set: {
                ...(action === 'revoke' ? { honorFrameIds: { $setDifference: [{ $ifNull: ['$honorFrameIds', []] }, [id]] } } : {}),
                honorFrameId: { $cond: [{ $eq: ['$honorFrameId', id] }, '', { $ifNull: ['$honorFrameId', ''] }] },
            } }];
    // Ownership stays in the write predicate: concurrent revocation cannot be undone.
    const result = await user.coll.updateMany(action === 'grant' ? { ...query, honorFrameIds: { $ne: id } } : query, update);
    if (action === 'grant' || action === 'equip') await checkFrameAfterWrite(id, uids);
    deleteUserCache(true);
    return { matched: result.matchedCount, requested: uids.length };
}
