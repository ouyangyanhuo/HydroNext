import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { ObjectId } from 'mongodb';
import { SystemError } from '../error';
import db from '../service/db';

interface StatisticsLease {
    token: ObjectId;
    active: boolean;
    lost: boolean;
}

const leases = new AsyncLocalStorage<Map<string, StatisticsLease>>();
const leaseMs = 120_000;

export function userStatisticsWriteQuery(domainId: string, uid: number) {
    const lease = leases.getStore()?.get(JSON.stringify([domainId, uid]));
    if (!lease?.active || lease.lost) throw new SystemError('User statistics update expired. Please try again.');
    return {
        domainId, uid,
        '_userStatsLock.token': lease.token,
        '_userStatsLock.expiresAt': { $gt: new Date() },
    };
}

/** Reentrant, per-user coordination across workers, without requiring a MongoDB replica set. */
export async function withUserStatisticsUpdate<T>(domainId: string, uid: number, action: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([domainId, uid]);
    const current = leases.getStore();
    if (current?.get(key)?.active) {
        userStatisticsWriteQuery(domainId, uid);
        return action();
    }
    const users = db.collection('domain.user');
    await users.updateOne({ domainId, uid }, { $setOnInsert: { domainId, uid } }, { upsert: true });
    const lease: StatisticsLease = { token: new ObjectId(), active: true, lost: false };
    const deadline = Date.now() + 10_000;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await users.updateOne({ domainId, uid, $or: [
            { _userStatsLock: { $exists: false } },
            { '_userStatsLock.expiresAt': { $lte: new Date() } },
        ] }, [{ $set: {
            _userStatsLock: { $literal: { token: lease.token, expiresAt: new Date(Date.now() + leaseMs) } },
            _userStatsRevision: { $add: [{ $ifNull: ['$_userStatsRevision', 0] }, 1] },
        } }]);
        if (result.matchedCount) break;
        if (Date.now() >= deadline) throw new SystemError('User statistics are busy. Please try again.');
        // eslint-disable-next-line no-await-in-loop
        await delay(10 + Math.floor(Math.random() * 20));
    }
    const scope = new Map(current);
    scope.set(key, lease);
    let renewing: Promise<unknown> = Promise.resolve();
    const timer = setInterval(() => {
        renewing = renewing.then(async () => {
            const result = await users.updateOne({ domainId, uid, '_userStatsLock.token': lease.token,
                '_userStatsLock.expiresAt': { $gt: new Date() } }, {
                $set: { '_userStatsLock.expiresAt': new Date(Date.now() + leaseMs) },
            });
            if (!result.matchedCount) lease.lost = true;
        }).catch(() => { lease.lost = true; });
    }, 10_000);
    timer.unref();
    try {
        return await leases.run(scope, action);
    } finally {
        lease.active = false;
        clearInterval(timer);
        await renewing;
        await users.updateOne({ domainId, uid, '_userStatsLock.token': lease.token }, [
            { $set: { _userStatsRevision: { $add: [{ $ifNull: ['$_userStatsRevision', 0] }, 1] } } },
            { $unset: '_userStatsLock' },
        ]);
    }
}
