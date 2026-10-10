import assert from 'assert';
import { writeFileSync } from 'fs';
import autocannon from 'autocannon';
import {
    after, before, describe, it,
} from 'node:test';
import * as supertest from 'supertest';
import { STATUS } from '@hydrooj/common';

const Root = {
    username: 'root',
    password: '123456',
    creditionals: null,
};

function getPageArgs(response: any) {
    const injection = response.text?.match(/<script id="__HYDRO_INJECTION__" type="application\/json">([\s\S]*?)<\/script>/);
    return injection ? JSON.parse(injection[1]).args : response.body;
}

describe('App', () => {
    let agent;
    before(async () => {
        const init = Date.now();
        await new Promise((resolve) => {
            process.send = ((send) => (data) => {
                console.log('send', data);
                if (data === 'ready') {
                    agent = supertest.agent(require('hydrooj').httpServer);
                    resolve(null);
                }
                return send?.(data) || false;
            })(process.send);
        });
        console.log('Application inited in %d ms', Date.now() - init);
    }, { timeout: 30000 });

    const routes = ['/', '/p', '/contest', '/homework', '/user/1', '/training', '/ranking', '/ranking?sort=rp'];
    for (const route of routes) {
        // eslint-disable-next-line ts/no-loop-func
        it(`GET ${route}`, () => agent.get(route).expect(200));
    }

    it('API user', async () => {
        await agent.get('/api/user?args={"id":1}&projection=uname').expect({ uname: 'Hydro' });
        await agent.get('/api/user?args={"id":2}&projection=uname').expect(null);
    });

    it('Page documents and SPA JSON at the same URL are uncacheable and vary by representation', async () => {
        for (const route of ['/p?page=1', '/d/system/p?page=1']) {
            for (const accept of ['text/html', 'application/json', 'text/html']) {
                const request = agent.get(route).set('Accept', accept);
                if (accept === 'application/json') request.set('x-hydro-inject', 'uicontext,usercontext,pagename');
                // eslint-disable-next-line no-await-in-loop
                const response = await request.expect(200);
                assert.equal(response.headers['cache-control'], 'no-store');
                assert.ok(response.headers['content-type'].startsWith(accept));
                const vary = response.headers.vary.toLowerCase().split(/,\s*/);
                assert.ok(vary.includes('accept'));
                assert.ok(vary.includes('x-hydro-inject'));
                if (accept === 'application/json') assert.ok(response.body.UiContext);
            }
        }
    });

    it('List routes accept and return every explicit sorting mode', async () => {
        for (const route of ['/p', '/training']) {
            for (const sort of ['default', 'asc', 'desc', 'recent', 'oldest']) {
                // eslint-disable-next-line no-await-in-loop
                const response = await agent.get(`${route}?sort=${sort}`).expect(200);
                assert.equal(getPageArgs(response).sort, sort);
            }
        }
    });

    it('User profile returns bounded accepted-problem pagination', async () => {
        const res = await agent.get('/user/1?page=2&tab=accepted').expect(200);
        const args = getPageArgs(res);
        assert.equal(args.acceptedPageSize, 50);
        assert.ok(args.pdocs.length <= 50);
        assert.ok(args.acceptedCount >= args.pdocs.length);
        assert.ok(args.acceptedPage >= 1 && args.acceptedPage <= args.acceptedPageCount);
        assert.equal(args.acceptedPageCount, Math.max(1, Math.ceil(args.acceptedCount / 50)));
    });

    it('Create User', async () => {
        const redirect = await agent.post('/register')
            .send({ mail: 'test@example.com' })
            .expect(302)
            .then((res) => res.headers.location);
        await agent.post(redirect)
            .send({ uname: Root.username, password: Root.password, verifyPassword: Root.password })
            .expect(302);
    });

    it('Login', async () => {
        const cookie = await agent.post('/login')
            .send({ uname: Root.username, password: Root.password })
            .expect(302)
            .then((res) => res.headers['set-cookie']);
        Root.creditionals = cookie;
    });

    it('API registered user', async () => {
        await agent.get('/api/user?args={"id":2}&projection=uname').expect({ uname: 'root' });
    });

    it('Proctor APIs preserve contest/domain enrollment and do not expose server secrets', async () => {
        const { contest, domain } = global.Hydro.model;
        const domainId = 'proctor-route-test';
        await domain.add(domainId, 2, 'Proctor route test', '');
        const now = Date.now();
        const tid = await contest.add(domainId, 'Proctor route test', '', 2, 'acm', new Date(now - 60000),
            new Date(now + 3600000), [], false, { proctorEnabled: true });
        try {
            await contest.attend(domainId, tid, 2);
            const route = `/d/${domainId}/contest/${tid}/proctor`;
            const proctor = require('../packages/hydrooj/src/model/proctor');
            const { verifyPayload } = require('../packages/hydrooj/src/lib/proctor');
            const keys = await proctor.generateKeys();
            const identity = await agent.post(`/d/${domainId}/proctor/identity`).set('Accept', 'application/json')
                .send({ clientNonce: 'n'.repeat(43), tid: tid.toHexString() }).expect(200);
            assert.ok(verifyPayload(identity.body.payload, identity.body.signature, keys.signingPublicKey));
            assert.equal(identity.body.payload.uid, 2);
            const loggedIn = await global.Hydro.model.user.getById(domainId, 2);
            const { PRIV } = require('../packages/hydrooj/src/model/builtin');
            assert.equal(identity.body.payload.root, loggedIn.hasPriv(PRIV.PRIV_ALL));
            assert.equal(identity.body.payload.domainId, domainId);
            assert.equal(identity.body.payload.tid, tid.toHexString());
            assert.equal(identity.body.payload.proctorEnabled, true);
            assert.equal(identity.headers['cache-control'], 'no-store');
            await agent.post(`/d/${domainId}/proctor/identity`).set('Accept', 'application/json')
                .send({ clientNonce: 'bad' }).expect(403);
            const guest = await supertest.agent(require('hydrooj').httpServer).post('/proctor/identity')
                .set('Accept', 'application/json').send({ clientNonce: 'g'.repeat(43) }).expect(200);
            assert.ok(verifyPayload(guest.body.payload, guest.body.signature, keys.signingPublicKey));
            assert.equal(guest.body.payload.uid, 0);
            assert.equal(guest.body.payload.root, false);
            const status = await agent.get(route).set('Accept', 'application/json').expect(200);
            assert.equal(status.body.state, 'not_started');
            assert.equal(status.body.logUploaded, false);
            assert.equal(status.headers['cache-control'], 'no-store');
            assert.equal(status.body.token, undefined);
            assert.equal(status.body.privateKey, undefined);
            for (const path of [`/d/${domainId}/p/999?tid=${tid}`, `/d/${domainId}/p/999?tid=${tid}&noTemplate=true&pjax=true`,
                `/d/${domainId}/contest/${tid}/problems`]) {
                // eslint-disable-next-line no-await-in-loop
                const denied = await agent.get(path).set('Accept', 'application/json').expect(403);
                assert.equal(denied.body.error.name, 'ProctorClientRequiredError');
                assert.equal(denied.body.pdoc, undefined);
                assert.equal(denied.body.pdict, undefined);
                assert.equal(denied.headers['cache-control'], 'no-store');
            }
            assert.equal((await contest.getStatus(domainId, tid, 2)).startAt, undefined);
            const settings = await agent.get('/manage/proctor?pageSize=50').set('Accept', 'application/json').expect(200);
            assert.equal(settings.body.pageSize, 50);
            assert.ok(Array.isArray(settings.body.logs));
            assert.equal(settings.body.devices, undefined);
            assert.equal(settings.body.keys?.signingPrivateKey, undefined);
            assert.equal(settings.body.keys?.encryptionPrivateKey, undefined);
            assert.equal(settings.headers['cache-control'], 'no-store');
            await agent.get('/manage/proctor/logs?pageSize=500').set('Accept', 'application/json').expect(400);
            await agent.post(route).set('Accept', 'application/json').send({ operation: 'challenge', version: 'wrong' }).expect(403);
            await agent.get(`/d/system/contest/${tid}/proctor`).set('Accept', 'application/json').expect(404);
            await supertest.agent(require('hydrooj').httpServer).get('/manage/proctor/logs').set('Accept', 'application/json').expect(403);
        } finally {
            await contest.del(domainId, tid);
            await domain.del(domainId);
        }
    });

    it('Client updates are global, private before publication and use an exact public JSON manifest', async () => {
        const updates = require('../packages/hydrooj/src/model/client-update');
        const guest = supertest.agent(require('hydrooj').httpServer);
        await guest.get('/manage/client-updates').set('Accept', 'application/json').expect(403);
        await guest.post('/manage/client-updates').set('Accept', 'application/json')
            .send({ operation: 'delete', id: '0123456789abcdef01234567', revision: 0 }).expect(403);
        await guest.get('/client-updates/version.json').set('Accept', 'application/json').expect(404);
        const settings = await agent.get('/d/system/manage/client-updates').set('Accept', 'application/json').expect(200);
        assert.equal(settings.headers['cache-control'], 'no-store');
        assert.ok(Array.isArray(settings.body.assets));
        assert.ok(settings.body.assets.length <= 25);
        const manifest = { version: '1.2.3', releaseDate: '2026-10-10T00:00:00.000Z', description: 'test', changelog: [] };
        try {
            await updates.settings.updateOne({ _id: 'settings' }, { $set: { manifest } });
            for (const route of ['/client-updates/version.json', '/d/system/client-updates/version.json']) {
                // eslint-disable-next-line no-await-in-loop
                const response = await guest.get(route).set('x-hydro-inject', 'uicontext,usercontext').expect(200);
                assert.deepEqual(response.body, manifest);
                assert.ok(response.headers['content-type'].includes('application/json'));
                assert.equal(response.headers['cache-control'], 'no-store');
            }
        } finally {
            await updates.settings.deleteOne({ _id: 'settings' });
        }
    });

    it('Solved ranking includes domain members with zero solved problems', async () => {
        const res = await agent.get('/ranking').expect(200);
        const args = getPageArgs(res);
        assert.equal(args.sort, 'solved');
        assert.equal(args.udocs[0]._id, 2);
        assert.equal(args.solvedCounts[2], 0);
    });

    it('Solved ranking counts only accepted problems in this domain', async () => {
        const { TYPE_PROBLEM } = global.Hydro.model.document;
        await global.Hydro.model.document.collStatus.insertMany([
            { domainId: 'system', docType: TYPE_PROBLEM, docId: 1001, uid: 2, status: STATUS.STATUS_ACCEPTED },
            { domainId: 'system', docType: TYPE_PROBLEM, docId: 1002, uid: 2, status: STATUS.STATUS_WRONG_ANSWER },
            { domainId: 'other', docType: TYPE_PROBLEM, docId: 1003, uid: 2, status: STATUS.STATUS_ACCEPTED },
        ]);
        const res = await agent.get('/ranking').expect(200);
        const args = getPageArgs(res);
        assert.equal(args.solvedCounts[2], 1);
        assert.equal(args.udocs[0]._id, 2);
    });

    it('Contest announcements remain domain-scoped and require active-contest administration', async () => {
        const { contest, domain } = global.Hydro.model;
        const announcements = require('../packages/hydrooj/src/model/contest-announcement');
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
            await domain.setUserRole(domainId, 2, 'default');
            await agent.post(route).set('Accept', 'application/json')
                .send({ operation: 'announcement', content: 'Not an administrator' }).expect(403);
        } finally {
            await contest.del(domainId, tid);
            await domain.del(domainId);
        }
    });

    it('Contest scoreboard preserves domain-scoped problem times in page data and CSV exports', async () => {
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
            assert.ok(exported.text.includes('00:00:15'));
            await agent.get(`/contest/${tid}/scoreboard`).set('Accept', 'application/json').expect(404);
        } finally {
            await contest.del(domainId, tid);
            await domain.del(domainId);
        }
    });

    it('Training editing restores PID titles and persists per-chapter problem order', async () => {
        const { domain, problem, training } = global.Hydro.model;
        const domainId = 'training-editor-test';
        await domain.add(domainId, 2, 'Training editor test', '');
        const p1 = await problem.add(domainId, 'J0001', 'First problem', 'Statement', 2);
        const p2 = await problem.add(domainId, 'J0002', 'Second problem', 'Statement', 2);
        const tid = await training.add(domainId, 'Training editor test', 'Intro', 2, [
            { _id: 1, title: 'Basics', requireNids: [], pids: [p1, p2] },
            { _id: 2, title: 'Advanced', requireNids: [1], pids: [p2] },
        ], 'Description');
        const route = `/d/${domainId}/training/${tid}/edit`;
        try {
            const first = getPageArgs(await agent.get(route).set('Accept', 'application/json').expect(200));
            assert.equal(first.pdict[p1].title, 'First problem');
            assert.equal(first.pdict[p2].pid, 'J0002');
            const dag = [
                { _id: 7, title: 'Basics', requireNids: [], pids: [p2, p1] },
                { _id: 2, title: 'Advanced', requireNids: [7], pids: [p2] },
            ];
            await agent.post(route).set('Accept', 'application/json').send({
                title: 'Renamed training', content: 'Intro', description: 'Description', pin: 0, dag: JSON.stringify(dag),
            }).expect(200);
            const reopened = getPageArgs(await agent.get(route).set('Accept', 'application/json').expect(200));
            assert.deepEqual(JSON.parse(reopened.dag), dag);
            assert.equal(reopened.tdoc.title, 'Renamed training');
            assert.equal(reopened.pdict[p1].title, 'First problem');
            await agent.get(`/training/${tid}/edit?domainId=${domainId}`).set('Accept', 'application/json').expect(403);
        } finally {
            await training.del(domainId, tid);
            await Promise.all([problem.del(domainId, p1), problem.del(domainId, p2)]);
            await domain.del(domainId);
        }
    });

    // TODO add more tests

    const results: Record<string, autocannon.Result> = {};
    if (process.env.BENCHMARK) {
        for (const route of routes) {
            it(`Performance test ${route}`, { timeout: 60000 }, async () => {
                const result = await autocannon({ url: `http://localhost:8888${route}` });
                assert(result.errors === 0, `test ${route} returns errors`);
                results[route] = result;
            });
        }
    }

    after(() => {
        if (process.env.BENCHMARK) {
            const metrics = Object.entries(results).map(([k, v]) => ({
                name: `Benchmark - ${k} - Req/sec`,
                unit: 'Req/sec',
                value: v.requests.average,
            }));
            writeFileSync('./benchmark.json', JSON.stringify(metrics, null, 2));
        }
        setTimeout(() => process.exit(0), 1000);
    });
});
