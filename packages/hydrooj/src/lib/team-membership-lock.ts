import { setTimeout as delay } from 'node:timers/promises';
import { ObjectId } from 'mongodb';
import { NotFoundError, SystemError } from '../error';
import db from '../service/db';

/** Serialize roster changes and registrations across workers, including standalone MongoDB deployments. */
export async function withTeamMembershipLock<T>(domainId: string, action: () => Promise<T>): Promise<T> {
    const domains = db.collection('domain');
    const token = new ObjectId();
    const deadline = Date.now() + 10000;
    const lease = 120000;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await domains.updateOne({ _id: domainId, $or: [
            { _teamMembershipLock: { $exists: false } },
            { '_teamMembershipLock.expiresAt': { $lte: new Date() } },
        ] }, { $set: { _teamMembershipLock: { token, expiresAt: new Date(Date.now() + lease) } } });
        if (result.matchedCount) break;
        // eslint-disable-next-line no-await-in-loop
        if (!await domains.findOne({ _id: domainId }, { projection: { _id: 1 } })) throw new NotFoundError('Domain');
        if (Date.now() >= deadline) throw new SystemError('Team membership is busy. Please try again.');
        // eslint-disable-next-line no-await-in-loop
        await delay(25);
    }
    let renewing: Promise<unknown> = Promise.resolve();
    const timer = setInterval(() => {
        renewing = renewing.then(() => domains.updateOne({ _id: domainId, '_teamMembershipLock.token': token }, {
            $set: { '_teamMembershipLock.expiresAt': new Date(Date.now() + lease) },
        })).catch(() => { /* The next database operation reports an unavailable database. */ });
    }, 10000);
    timer.unref();
    try {
        return await action();
    } finally {
        clearInterval(timer);
        await renewing;
        await domains.updateOne({ _id: domainId, '_teamMembershipLock.token': token }, { $unset: { _teamMembershipLock: '' } });
    }
}
