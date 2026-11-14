/* eslint-disable no-await-in-loop -- Each contest exercises its own policy and participant state. */
import assert from 'node:assert/strict';
import * as supertest from 'supertest';

export async function runManagementHttpTests(admin: any, { getPageArgs }: any) {
    const { domain, problem, contest, record, user } = global.Hydro.model;
    const { PERM, PRIV } = require('hydrooj');
    const { ObjectId } = require('mongodb');
    const domainId = 'objective-once-regression';
    const counters = require('../../hydrooj/src/service/db').default.collection('opcount');
    await counters.deleteMany({ op: { $in: ['global', 'user_login'] } });
    await domain.add(domainId, 2, 'Objective once', '');
    await domain.setRoles(domainId, { guest: 0n, default: PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM
        | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST | PERM.PERM_SUBMIT_PROBLEM });
    const uids = [];
    const tids = [];
    const clients = [];
    for (const name of ['one', 'two']) {
        const uid = await user.create(`objective-${name}@example.com`, `objective-once-${name}`, 'secret', undefined,
            '127.0.0.1', PRIV.PRIV_DEFAULT);
        uids.push(uid);
        await domain.setJoin(domainId, uid, true);
        const client = supertest.agent(require('hydrooj').httpServer);
        await client.post('/login').send({ uname: `objective-once-${name}`, password: 'secret' }).expect(302);
        clients.push(client);
    }
    const pid = await problem.add(domainId, 'OBJ', 'Objective', '{{ input(1) }}\n\n{{ input(2) }}', 2);
    await problem.edit(domainId, pid, { config: 'type: objective\nanswers:\n  1: [A, 50]\n  2: [B, 50]\n' });
    const programming = await problem.add(domainId, 'CODE', 'Programming', 'Statement', 2);
    const createContest = async (rule: string, options: any = {}) => {
        const now = Date.now();
        const tid = await contest.add(domainId, 'Objective once', '', 2, rule, new Date(now - 60000),
            new Date(now + 3600000), [pid, programming], false, { objectiveOnce: true, ...options });
        tids.push(tid);
        for (const uid of uids) await contest.attend(domainId, tid, uid, { startAt: new Date(now - 1000) });
        return tid;
    };
    try {
        const index = (await record.coll.indexes()).find((entry: any) => entry.name === 'unique_objective_once');
        assert.equal(index.unique, true);
        // Round-trip the actual settings route, including preserving an untouched checkbox on later edits.
        const settings = {
            operation: 'update', title: 'Objective settings', content: 'Contest rules', rule: 'oi', pids: String(pid),
            beginAtDate: '2099-01-01', beginAtTime: '12:00', duration: 2, objectiveOnce: true,
        };
        const created = await admin.post(`/d/${domainId}/contest/create`).set('Accept', 'application/json').send(settings).expect(200);
        const configured = new ObjectId(created.body.tid);
        tids.push(configured);
        assert.equal((await contest.get(domainId, configured)).objectiveOnce, true);
        const editRoute = `/d/${domainId}/contest/${configured}/edit`;
        await admin.post(editRoute).set('Accept', 'application/json').send({ ...settings, objectiveOnce: false }).expect(200);
        assert.equal((await contest.get(domainId, configured)).objectiveOnce, false);
        await admin.post(editRoute).set('Accept', 'application/json').send(settings).expect(200);
        await admin.post(editRoute).set('Accept', 'application/json').send({ ...settings, objectiveOnce: undefined }).expect(200);
        assert.equal((await contest.get(domainId, configured)).objectiveOnce, true);
        await contest.edit(domainId, configured, { beginAt: new Date(Date.now() - 60000), endAt: new Date(Date.now() + 3600000) });
        assert.equal(getPageArgs(await admin.get(editRoute).set('Accept', 'application/json').expect(200)).objectiveOnceLocked, true);
        await admin.post(editRoute).set('Accept', 'application/json').send({ ...settings, objectiveOnce: false }).expect(403);
        assert.equal((await contest.get(domainId, configured)).objectiveOnce, true);

        for (const rule of ['acm', 'oi', 'ioi', 'strictioi', 'ledo']) {
            await counters.deleteMany({ op: { $in: ['global', 'add_record'] } });
            const tid = await createContest(rule);
            const path = `/d/${domainId}/p/${pid}`;
            const submit = `${path}/submit?tid=${tid}`;
            const before = getPageArgs(await clients[0].get(`${path}?tid=${tid}`).set('Accept', 'application/json').expect(200));
            assert.equal(before.objectiveSubmission.once, true);
            assert.equal(before.objectiveSubmission.submitted, false);
            // Invalid input never reaches record insertion and must leave the opportunity intact.
            await clients[0].post(submit).set('Accept', 'application/json').send({ lang: '_' }).expect(403);
            assert.equal(await record.coll.countDocuments({ domainId, contest: tid, pid }), 0);
            const results = await Promise.all([0, 1].map(() => clients[0].post(submit).set('Accept', 'application/json')
                .send({ lang: '_', code: '1: A\n' })));
            assert.deepEqual(results.map((response) => response.status).sort(), [200, 403]);
            assert.equal(await record.coll.countDocuments({ domainId, contest: tid, pid }), 1);
            const result = results.find((response) => response.status === 200).body;
            if (rule === 'oi') {
                assert.equal(result.rid, undefined);
                assert.equal(result.tid, String(tid));
            } else assert.ok(result.rid);
            const after = getPageArgs(await clients[0].get(`${path}?tid=${tid}`).set('Accept', 'application/json').expect(200));
            assert.equal(after.objectiveSubmission.submitted, true);
            assert.equal(after.objectiveSubmission.answers, '1: A\n');
            assert.equal(after.objectiveSubmission.score, undefined);
            assert.equal(getPageArgs(await clients[1].get(`${path}?tid=${tid}`).set('Accept', 'application/json').expect(200))
                .objectiveSubmission.submitted, false);
            // Canceling a result or resetting it for rejudging must not grant a new answer sheet.
            const original = await record.coll.findOne({ domainId, contest: tid, pid });
            await record.reset(domainId, original._id, false);
            await clients[0].post(submit).set('Accept', 'application/json').send({ lang: '_', code: '1: B' }).expect(403);
            // A second problem and a second participant have independent opportunities.
            await record.add(domainId, pid, uids[1], '_', '1: B', false, { type: 'judge', contest: tid });
            for (let i = 0; i < 2; i++) await record.add(domainId, programming, uids[0], '_', 'code', false, { type: 'judge', contest: tid });
        }
        // Exercise the database race directly, outside the per-user HTTP statistics lock.
        const race = await createContest('strictioi');
        const concurrent = await Promise.allSettled(Array.from({ length: 8 }, () =>
            record.add(domainId, pid, uids[0], '_', '1: A', false, { type: 'judge', contest: race })));
        assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(await record.coll.countDocuments({ domainId, contest: race, pid }), 1);
        for (const result of concurrent) {
            if (result.status === 'rejected') {
                // Event dispatch aggregates listener errors; HTTP uses the same unwrapping helper.
                const error = require('@hydrooj/utils').unwrapAggregateError(result.reason);
                assert.match(error.params?.[0] || error.message, /only be submitted once/);
            }
        }
        // Different teammates still share the same database uniqueness scope.
        const teamTid = await createContest('ioi', { allowTeam: true });
        await contest.setStatus(domainId, teamTid, -12345, { attend: 1, members: uids, startAt: new Date(Date.now() - 1000) });
        const teamResults = await Promise.allSettled(uids.map((uid) =>
            record.add(domainId, pid, uid, '_', '1: A', false, { type: 'judge', contest: teamTid, contestUid: -12345 })));
        assert.equal(teamResults.filter((result) => result.status === 'fulfilled').length, 1);
        for (const client of clients) {
            const page = getPageArgs(await client.get(`/d/${domainId}/p/${pid}?tid=${teamTid}`).set('Accept', 'application/json').expect(200));
            assert.equal(page.objectiveSubmission.submitted, true);
        }
        // Practice, homework and unselected contests retain unrestricted repeat submissions.
        for (const tid of [undefined, await createContest('homework'), await createContest('oi', { objectiveOnce: false })]) {
            for (let i = 0; i < 2; i++) await record.add(domainId, pid, uids[0], '_', '1: A', false, { type: 'judge', contest: tid });
        }
    } finally {
        await record.coll.deleteMany({ domainId });
        for (const tid of tids) await contest.del(domainId, tid);
        await domain.del(domainId);
        await user.coll.deleteMany({ _id: { $in: uids } });
        user._deleteUserCache(true);
        await counters.deleteMany({ op: { $in: ['global', 'user_login'] } });
    }
}
