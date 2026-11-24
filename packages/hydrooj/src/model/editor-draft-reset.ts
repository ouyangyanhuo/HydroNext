import type { ObjectId } from 'mongodb';
import type { RecordDoc } from '../interface';
import db from '../service/db';

interface EditorDraftReset {
    _id: string;
    version: number;
    requestedBy: number;
    requestedAt: Date;
    recordId: ObjectId;
}

declare module '../service/db' {
    interface Collections {
        'editor.draftReset': EditorDraftReset;
    }
}

function key(domainId: string, uid: number, problemId: ObjectId, contestId?: ObjectId) {
    return JSON.stringify([domainId, uid, problemId.toHexString(), contestId?.toHexString() || '']);
}

export async function getDraftResetVersion(domainId: string, uid: number, problemId: ObjectId, contestId?: ObjectId) {
    const reset = await db.collection('editor.draftReset').findOne(
        { _id: key(domainId, uid, problemId, contestId) }, { projection: { version: 1 } },
    );
    return reset?.version ?? 0;
}

/** Each browser applies the newest version independently; reading never consumes a reset. */
export async function requestDraftReset(rdoc: RecordDoc, problemId: ObjectId, requestedBy: number) {
    return await db.collection('editor.draftReset').findOneAndUpdate(
        { _id: key(rdoc.domainId, rdoc.uid, problemId, rdoc.contest) },
        {
            $inc: { version: 1 },
            $set: { requestedBy, requestedAt: new Date(), recordId: rdoc._id },
        },
        { upsert: true, returnDocument: 'after' },
    );
}
