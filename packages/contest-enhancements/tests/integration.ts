import assert from 'node:assert/strict';
import * as supertest from 'supertest';

async function announcementsTest(agent: any, { getPageArgs }: any) {
    const { contest, domain } = global.Hydro.model;
    const announcements = require('../model/announcements');
    const domainId = 'contest-announcement-test';
    await domain.add(domainId, 2, 'Announcement test', '');
    const now = Date.now();
    const tid = await contest.add(domainId, 'Announcement test', '', 2, 'acm', new Date(now - 60_000), new Date(now + 3_600_000));
    const route = `/d/${domainId}/contest/${tid}/management`;
    try {
        await contest.attend(domainId, tid, 2);
        const manage = await agent.get(route).set('Accept', 'application/json').expect(200);
        assert.equal(getPageArgs(manage).canSendAnnouncement, true);
        const result = await agent.post(route).set('Accept', 'application/json')
            .send({ operation: 'announcement', content: 'Important notice' }).expect(200);
        assert.equal(result.body.recipients, 1);
        const pending = await announcements.pending(2);
        assert.equal(pending.length, 1);
        assert.equal(pending[0].domainId, domainId);
        assert.equal(pending[0].content, 'Important notice');
        assert.equal(pending[0].recipients, undefined);
        assert.equal((await announcements.pending(1)).length, 0);
        await announcements.acknowledge(2, result.body.id);
        assert.equal((await announcements.pending(2)).length, 0);
        await agent.post(`/contest/${tid}/management`).set('Accept', 'application/json')
            .send({ operation: 'announcement', content: 'Wrong domain' }).expect(404);
        await agent.post(`/contest/${tid}/management`).set('Accept', 'application/json')
            .send({ operation: 'announcement', domainId, content: 'Domain override' }).expect(403);
        await contest.edit(domainId, tid, { beginAt: new Date(now + 60_000) });
        await agent.post(route).set('Accept', 'application/json')
            .send({ operation: 'announcement', content: 'Too early' }).expect(403);
        await contest.edit(domainId, tid, { beginAt: new Date(now - 60_000) });
        const { user } = global.Hydro.model;
        const uid = await user.create('announcement-outsider@example.com', 'announcement-outsider', 'secret');
        await domain.setJoin(domainId, uid, true);
        const nonadmin = supertest.agent(require('hydrooj').httpServer);
        const login = await nonadmin.post('/login').send({ uname: 'announcement-outsider', password: 'secret' }).expect(302);
        await nonadmin.post(route).set('Accept', 'application/json')
            .send({ operation: 'announcement', content: 'Not an administrator' }).expect(403);
        const ending = require('../model/ending');
        // Editing an expired schedule back into the future must not end the contest.
        await contest.edit(domainId, tid, { endAt: new Date(now - 1000) });
        await contest.edit(domainId, tid, { endAt: new Date(now + 3_600_000) });
        await ending.runDue();
        assert.equal((await announcements.pending(2)).filter((item) => item.domainId === domainId).length, 0);
        await contest.edit(domainId, tid, { proctorEnabled: true });
        await agent.post(`/d/${domainId}/contest/${tid}`).send({ operation: 'early_end' }).expect(302);
        const personalEarly = (await announcements.pending(2)).find((item) => item.domainId === domainId);
        assert.equal(personalEarly.kind, 'participation-ended');
        assert.equal(personalEarly.content, 'You have ended your proctored contest early. Contest submissions are now closed.');
        await announcements.acknowledge(2, personalEarly._id.toHexString());
        await agent.post(`/d/${domainId}/contest/${tid}/user`).send({ operation: 'resume', uid: 2 }).expect(302);
        assert.equal((await contest.getStatus(domainId, tid, 2)).earlyEndAt, undefined);
        await contest.setStatus(domainId, tid, 2, { endAt: new Date(now - 1000) });
        await ending.notifyEnded(domainId, tid, 2);
        const personalTimedOut = (await announcements.pending(2)).find((item) => item.domainId === domainId);
        assert.equal(personalTimedOut.content, 'Your contest time is up. Contest submissions are now closed.');
        await announcements.acknowledge(2, personalTimedOut._id.toHexString());
        await agent.post(`/d/${domainId}/contest/${tid}/user`).send({ operation: 'resume', uid: 2 }).expect(302);
        await contest.edit(domainId, tid, { proctorEnabled: false });
        // A team finish targets its real members, not the team's negative virtual UID.
        const documents = global.Hydro.model.document;
        await documents.setStatus(domainId, documents.TYPE_CONTEST, tid, -1000,
            { attend: 1, members: [2, uid], endAt: new Date(now - 1000) });
        const WebSocket = require('ws');
        const cookie = login.headers['set-cookie'].map((value: string) => value.split(';')[0]).join('; ');
        const port = require('hydrooj').httpServer.address().port;
        const socket = new WebSocket(`ws://127.0.0.1:${port}/contest-announcements-conn`, { headers: { Cookie: cookie } });
        let timer: ReturnType<typeof setTimeout>;
        try {
            const notice = new Promise<any>((resolve, reject) => {
                timer = setTimeout(() => reject(new Error('Team end announcement timed out')), 5000);
                socket.on('error', reject);
                socket.on('message', (message: Buffer) => {
                    if (message.toString() === 'ping') return socket.send('pong');
                    const item = JSON.parse(message.toString()).announcements?.find(
                        (entry) => entry.domainId === domainId && entry.kind === 'team-ended',
                    );
                    if (item) resolve(item);
                    return undefined;
                });
            });
            await Promise.all([
                ending.notifyEnded(domainId, tid, -1000), ending.notifyEnded(domainId, tid, -1000), notice,
            ]);
        } finally {
            clearTimeout(timer);
            socket.terminate();
        }
        const teamNotice = (await announcements.pending(uid)).filter((item) => item.domainId === domainId);
        assert.equal(teamNotice.length, 1);
        assert.equal(teamNotice[0].kind, 'team-ended');
        assert.equal(teamNotice[0].recipients, undefined);
        await announcements.acknowledge(uid, teamNotice[0]._id.toHexString());
        assert.equal((await announcements.pending(uid)).filter((item) => item.domainId === domainId).length, 0);
        assert.equal((await announcements.pending(2)).filter((item) => item.domainId === domainId).length, 1);
        // The persistent deadline job sends a single global end notice despite retries.
        await contest.edit(domainId, tid, { endAt: new Date(now - 1000) });
        await ending.runDue();
        await ending.notifyEnded(domainId, tid);
        const ended = (await announcements.pending(uid)).filter((item) => item.domainId === domainId);
        assert.equal(ended.length, 1);
        assert.equal(ended[0].kind, 'contest-ended');
        assert.equal((await announcements.pending(1)).filter((item) => item.domainId === domainId).length, 0);
    } finally {
        await contest.del(domainId, tid);
        await domain.del(domainId);
    }
}

async function scoreboardTest(agent: any, { getPageArgs }: any) {
    const { contest, domain, problem } = global.Hydro.model;
    const domainId = 'contest-time-test';
    await domain.add(domainId, 2, 'Contest time test', '');
    const p1 = await problem.add(domainId, 'P1', 'First', '', 2);
    const now = Date.now();
    const tid = await contest.add(domainId, 'Contest time test', '', 2, 'acm', new Date(now - 60_000), new Date(now + 3_600_000), [p1]);
    try {
        await contest.attend(domainId, tid, 2);
        await contest.setStatus(domainId, tid, 2, { totalProblemTime: 15_000, problemTimes: { [p1]: 15_000 } });
        const route = `/d/${domainId}/contest/${tid}/scoreboard`;
        const args = getPageArgs(await agent.get(route).set('Accept', 'application/json').expect(200));
        const index = args.rows[0].findIndex((cell) => cell.value === 'Total problem time' || cell.value === '总写题用时');
        assert.ok(index >= 0);
        assert.equal(args.rows[1][index].value, '00:00:15');
        assert.equal(args.rows[1].find((cell) => cell.type === 'record').problemTime, 15_000);
        const exported = await agent.get(`${route}/csv`).expect(200);
        assert.ok((exported.text || exported.body.toString('utf8')).includes('00:00:15'));
        await agent.get(`/contest/${tid}/scoreboard`).set('Accept', 'application/json').expect(404);
    } finally {
        await contest.del(domainId, tid);
        await domain.del(domainId);
    }
}

export async function runContestHttpTests(agent: any, helpers: any) {
    await announcementsTest(agent, helpers);
    await scoreboardTest(agent, helpers);
}

export async function runTeamActivityTests(_agent: any, { domainId, tid, member, pid }: any) {
    const { contest } = global.Hydro.model;
    const activity = require('../model/activity');
    await Promise.all([
        activity.heartbeat(domainId, await contest.get(domainId, tid), 2, 'root-tab', pid, true),
        activity.heartbeat(domainId, await contest.get(domainId, tid), member, 'member-tab', pid, true),
    ]);
    assert.equal((await contest.getStatus(domainId, tid, 2)).problemActivity.token, 'root-tab');
    assert.equal((await contest.getStatus(domainId, tid, member)).problemActivity.token, 'member-tab');
    assert.equal((await activity.getTimes(domainId, tid)).length, 1);
}
