import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { PermissionError, ValidationError } from '../error';
import bus from '../service/bus';
import db from '../service/db';

export interface ContestAnnouncementDoc {
    _id: ObjectId;
    domainId: string;
    tid: ObjectId;
    title: string;
    content: string;
    createdBy: number;
    createdAt: Date;
    recipients: number[];
}

interface AnnouncementReceipt {
    _id: ObjectId;
    announcementId: ObjectId;
    uid: number;
    acknowledgedAt: Date;
}

declare module '../service/db' {
    interface Collections {
        'contest.announcement': ContestAnnouncementDoc;
        'contest.announcement.receipt': AnnouncementReceipt;
    }
}

export const coll = db.collection('contest.announcement');
export const receipts = db.collection('contest.announcement.receipt');

export async function publish(payload: Omit<ContestAnnouncementDoc, '_id' | 'createdAt'>) {
    const content = payload.content.trim();
    if (!content || content.length > 4000) throw new ValidationError('content');
    const recipients = [...new Set(payload.recipients.filter((uid) => Number.isSafeInteger(uid) && uid > 0))];
    const doc = { ...payload, _id: new ObjectId(), createdAt: new Date(), content, recipients };
    await coll.insertOne(doc);
    bus.broadcast('contest/announcement', recipients);
    return { id: doc._id.toHexString(), recipients: recipients.length };
}

export async function pending(uid: number) {
    // Receipts are per user; confirming a broadcast must never dismiss it for other participants.
    return coll.aggregate([
        { $match: { recipients: uid } },
        { $sort: { _id: 1 } },
        { $lookup: {
            from: receipts.collectionName,
            let: { announcementId: '$_id' },
            pipeline: [{ $match: { uid, $expr: { $eq: ['$announcementId', '$$announcementId'] } } }],
            as: 'receipt',
        } },
        { $match: { 'receipt.0': { $exists: false } } },
        { $limit: 20 },
        { $project: { recipients: 0, receipt: 0, createdBy: 0 } },
    ]).toArray();
}

export async function acknowledge(uid: number, id: string) {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new ValidationError('id');
    const announcementId = new ObjectId(id);
    if (!await coll.findOne({ _id: announcementId, recipients: uid }, { projection: { _id: 1 } })) {
        throw new PermissionError();
    }
    try {
        await receipts.updateOne({ uid, announcementId }, { $setOnInsert: { acknowledgedAt: new Date() } }, { upsert: true });
    } catch (error) {
        // Two tabs can confirm simultaneously; the unique index guarantees a single receipt.
        if (error?.code !== 11000) throw error;
    }
    bus.broadcast('contest/announcement', [uid]);
}

export async function apply(ctx: Context) {
    await ctx.db.ensureIndexes(coll, { key: { recipients: 1, _id: 1 }, name: 'participant_announcements' });
    await ctx.db.ensureIndexes(coll, { key: { domainId: 1, tid: 1 }, name: 'contest_announcements' });
    await ctx.db.ensureIndexes(receipts, { key: { uid: 1, announcementId: 1 }, unique: true, name: 'announcement_receipts' });
    const remove = async (domainId: string, tid?: ObjectId) => {
        const query = { domainId, ...(tid ? { tid } : {}) };
        const docs = await coll.find(query).project({ _id: 1, recipients: 1 }).toArray();
        if (!docs.length) return;
        await coll.deleteMany(query);
        await receipts.deleteMany({ announcementId: { $in: docs.map((doc) => doc._id) } });
        bus.broadcast('contest/announcement', [...new Set(docs.flatMap((doc) => doc.recipients))]);
    };
    ctx.on('contest/del', remove);
    ctx.on('domain/delete', (domainId) => remove(domainId));
}
