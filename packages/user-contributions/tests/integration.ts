import assert from 'node:assert/strict';
import * as supertest from 'supertest';
import { PERM, STATUS } from 'hydrooj';

export async function runProfileHttpTests(agent: any, { getPageArgs }: any) {
    const { domain, user, record } = global.Hydro.model;
    const { ObjectId } = require('mongodb');
    const uid = await user.create('contributions@example.com', 'contributions-user', 'secret');
    const privateDomain = 'private-contribution-test';
    await domain.add(privateDomain, 2, 'Private contribution domain', '');
    await domain.setRoles(privateDomain, { guest: 0n, default: 0n });
    let sequence = 0;
    const submission = (domainId: string, pid: number, date: string, extra = {}) => ({
        _id: new ObjectId(`${Math.floor(Date.parse(date) / 1000).toString(16)}${(++sequence).toString(16).padStart(16, '0')}`),
        domainId, pid, uid, status: STATUS.STATUS_ACCEPTED, judgeAt: new Date(), ...extra,
    });
    const records = [
        submission('system', 10001, '2025-12-31T15:00:00Z'),
        submission('system', 10001, '2026-01-01T04:00:00Z'),
        submission(privateDomain, 10001, '2026-01-01T16:00:00Z'),
        submission(privateDomain, 10002, '2026-01-02T04:00:00Z'),
        submission(privateDomain, 10002, '2025-12-01T04:00:00Z', { status: STATUS.STATUS_WRONG_ANSWER }),
        submission(privateDomain, 10003, '2026-01-03T04:00:00Z', { contest: record.RECORD_PRETEST }),
        submission(privateDomain, 10004, '2026-01-03T05:00:00Z', { contest: record.RECORD_GENERATE }),
        submission(privateDomain, 10005, '2026-01-03T06:00:00Z', { uid: 2 }),
    ];
    await record.coll.insertMany(records);
    const guest = supertest.agent(require('hydrooj').httpServer);
    try {
        assert.equal((await user.getById(privateDomain, 0)).hasPerm(PERM.PERM_VIEW), false);
        const args = getPageArgs(await guest.get(`/user/${uid}`).set('Accept', 'application/json').expect(200));
        assert.equal(args.canViewRecords, false);
        assert.equal(args.contributions.summary.total, 3);
        assert.deepEqual(args.contributions.days, [{ date: '2025-12-31', count: 1 }, { date: '2026-01-02', count: 2 }]);
        assert.equal(args.contributions.summary.longestStreak, 1);
        assert.doesNotMatch(JSON.stringify(args.contributions), /private-contribution-test|domainId|pid|judgeAt|code/);
        const scoped = getPageArgs(await guest.get(`/d/system/user/${uid}`).set('Accept', 'application/json').expect(200));
        assert.deepEqual(scoped.contributions, args.contributions);
    } finally {
        await record.coll.deleteMany({ _id: { $in: records.map((item) => item._id) } });
        await domain.del(privateDomain);
    }
}
