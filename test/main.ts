import assert from 'assert';
import { generateKeyPairSync } from 'crypto';
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

async function runAddonHttpTests(method: string, agent: any, context: Record<string, any> = {}) {
    const { existsSync } = require('fs');
    const { resolve } = require('path');
    for (const directory of Object.values(global.addons)) {
        const entry = resolve(directory as string, 'tests/integration.ts');
        if (!existsSync(entry)) continue;
        const addon = require(entry);
        if (typeof addon[method] === 'function') {
            // eslint-disable-next-line no-await-in-loop
            await addon[method](agent, { getPageArgs, ...context });
        }
    }
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

    it('Enabled addons pass their own HTTP regressions', () => runAddonHttpTests('runHttpTests', agent));

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

    it('Registration defaults to enabled and the system switch protects both registration routes', async () => {
        const { system } = global.Hydro.model;
        const page = await agent.get('/register').expect(200);
        assert.equal(getPageArgs(page).UiContext.registrationEnabled, true);
        assert.equal(getPageArgs(page).UiContext.passwordResetEnabled, false);
        await system.set('server.allowRegister', false);
        try {
            await agent.get('/register').expect(403);
            await agent.post('/register').send({ mail: 'test@example.com' }).expect(403);
            await agent.get('/register/nonexistent-token').expect(403);
        } finally {
            await system.set('server.allowRegister', true);
        }
        const { user } = global.Hydro.model;
        const { PRIV } = require('../packages/hydrooj/src/model/builtin');
        await user.create('test@example.com', Root.username, Root.password, 2, '127.0.0.1', PRIV.PRIV_ALL);
        await global.Hydro.model.domain.setJoin('system', 2, true);
    });

    it('Public registration completes in its domain and default SMTP leaves recovery unavailable', async () => {
        const guest = supertest.agent(require('hydrooj').httpServer);
        const start = await guest.post('/d/system/register').set('Accept', 'application/json')
            .send({ mail: 'signup@example.com' }).expect(200);
        assert.ok(start.body.url.includes('/register/'));
        await guest.post(start.body.url).send({ uname: 'signup-user', password: '123456', verifyPassword: '123456' }).expect(302);
        const udoc = await global.Hydro.model.user.getByUname('system', 'signup-user');
        assert.ok(udoc);
        await agent.post('/lostpass').send({ mail: 'signup@example.com' }).expect(403);
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

    it('User profile administration requires system privileges and sudo, limits editable fields and invalidates domain caches', async () => {
        const { user, domain } = global.Hydro.model;
        const { PRIV } = require('../packages/hydrooj/src/model/builtin');
        const uid = await user.create('profile-edit@example.com', 'profile-edit-user', 'secret');
        const limitedAdmin = await user.create('profile-admin@example.com', 'profile-admin', 'secret', undefined,
            '127.0.0.1', PRIV.PRIV_DEFAULT | PRIV.PRIV_EDIT_SYSTEM);
        const domainId = 'profile-edit-scope';
        await domain.add(domainId, 2, 'Profile scope', '');
        await domain.setUserInDomain(domainId, uid, { displayName: 'Domain alias' });
        await user.setById(uid, { avatar: 'qq:123456', bio: 'Original bio', honorFrameIds: ['1234567890abcdef12345678'] });
        const route = `/d/${domainId}/manage/users/${uid}?page=3&q=profile`;
        const payload = { bio: 'Updated **bio**', qq: '998877', school: 'School A', studentId: '000123', phone: '+86 010-1234' };
        const admin = supertest.agent(require('hydrooj').httpServer);
        const ordinary = supertest.agent(require('hydrooj').httpServer);
        try {
            await ordinary.post('/login').send({ uname: 'profile-edit-user', password: 'secret' }).expect(302);
            await ordinary.get(route).set('Accept', 'application/json').expect(403);
            await ordinary.post(route).set('Accept', 'application/json').send(payload).expect(403);
            await admin.post('/login').send({ uname: Root.username, password: Root.password }).expect(302);
            const pending = await admin.get(route).set('Accept', 'application/json').expect(200);
            assert.match(pending.body.url, /\/user\/sudo$/);
            assert.equal(pending.body.profile, undefined);
            await admin.post(route).set('Accept', 'application/json').send(payload).expect(200)
                .then((response) => assert.match(response.body.url, /\/user\/sudo$/));
            assert.equal((await user.coll.findOne({ _id: uid })).bio, 'Original bio');
            const verification = await admin.post(pending.body.url).set('Accept', 'application/json')
                .send({ password: Root.password }).expect(200);
            assert.equal(verification.body.redirect, route);
            const loaded = await admin.get(route).set('Accept', 'application/json').expect(200);
            assert.deepEqual(Object.keys(loaded.body.profile).sort(),
                ['_id', 'uname', 'mail', 'avatar', 'bio', 'qq', 'school', 'studentId', 'phone'].sort());
            const original = await user.coll.findOne({ _id: uid });
            await user.getById('system', uid);
            await user.getById(domainId, uid);
            await admin.post(route).set('Accept', 'application/json').send({
                ...payload, uid: 2, priv: -1, uname: 'must-not-change', mail: 'must-not-change@example.com', avatar: 'url:https://evil.example/a.png',
            }).expect(200).expect(({ body }) => assert.equal(body.saved, true));
            const edited = await user.coll.findOne({ _id: uid });
            assert.equal(edited.uname, original.uname);
            assert.equal(edited.mail, original.mail);
            assert.equal(edited.priv, original.priv);
            assert.equal(edited.hash, original.hash);
            assert.equal(edited.avatar, 'qq:123456');
            assert.equal((await user.getById('system', uid)).bio, payload.bio);
            assert.equal((await user.getById(domainId, uid)).school, payload.school);
            assert.equal((await user.getById(domainId, uid)).displayName, 'Domain alias');
            await admin.post(route).set('Accept', 'application/json').send({ ...payload, resetAvatar: true }).expect(200);
            const reset = await user.coll.findOne({ _id: uid });
            assert.equal(reset.avatar, `gravatar:${original.mail}`);
            assert.equal(reset.studentId, '000123');
            assert.deepEqual(reset.honorFrameIds, original.honorFrameIds);
            await admin.post(route).set('Accept', 'application/json').send({ ...payload, phone: 'x'.repeat(256) }).expect(403)
                .then((response) => assert.equal(response.body.error.params[0], 'phone'));
            await admin.post(route).set('Accept', 'application/json')
                .send({ bio: '', qq: '', school: '', studentId: '', phone: '' }).expect(200);
            assert.equal((await user.getById(domainId, uid)).school, '');
            const manager = supertest.agent(require('hydrooj').httpServer);
            await manager.post('/login').send({ uname: 'profile-admin', password: 'secret' }).expect(302);
            const authorization = await manager.get('/manage/users/2').set('Accept', 'application/json').expect(200);
            await manager.post(authorization.body.url).send({ password: 'secret' }).expect(302);
            await manager.get('/manage/users/2').set('Accept', 'application/json').expect(400);
            await manager.post('/manage/users/2').set('Accept', 'application/json').send(payload).expect(400);
            await admin.get('/manage/users/2').set('Accept', 'application/json').expect(200)
                .then((response) => assert.equal(response.body.profile._id, 2));
            await admin.get('/manage/users/1').set('Accept', 'application/json').expect(400);
            await admin.get('/manage/users/999999').set('Accept', 'application/json').expect(404);
        } finally {
            await domain.del(domainId);
            await user.coll.deleteMany({ _id: { $in: [uid, limitedAdmin] } });
            user._deleteUserCache(true);
        }
    });

    it('Proctor settings and log access require sudo and return to the original scoped URL after authorization', async () => {
        const admin = supertest.agent(require('hydrooj').httpServer);
        await admin.post('/login').send({ uname: Root.username, password: Root.password }).expect(302);
        const route = '/d/system/manage/proctor?pageSize=50&q=test';
        const denied = await admin.get(route).set('Accept', 'application/json').expect(200);
        assert.match(denied.body.url, /\/user\/sudo$/);
        assert.equal(denied.body.config, undefined);
        assert.equal(denied.body.logs, undefined);
        const authorization = await admin.get(denied.body.url).set('Accept', 'application/json').expect(200);
        assert.equal(authorization.body.redirect, route);
        await admin.post(denied.body.url).send({ password: Root.password }).expect(302).expect('Location', route);
        const allowed = await admin.get(route).set('Accept', 'application/json').expect(200);
        assert.ok(allowed.body.config);
        assert.equal(allowed.body.pageSize, 50);
        await admin.post('/login').send({ uname: Root.username, password: Root.password }).expect(302);
        const logs = await admin.get('/manage/proctor/logs').set('Accept', 'application/json').expect(200);
        assert.match(logs.body.url, /\/user\/sudo$/);
        assert.equal(logs.body.logs, undefined);
        const download = await admin.post('/manage/proctor/logs').set('Accept', 'application/json')
            .send({ operation: 'download', ids: [] }).expect(200);
        assert.match(download.body.url, /\/user\/sudo$/);
    });

    it('Domain navigation settings persist only in their domain, preserve page permissions and reject malformed flags', async () => {
        const { domain, contest } = global.Hydro.model;
        const a = 'navigation-exam';
        const b = 'navigation-practice';
        await domain.add(a, 2, 'Exam navigation', '');
        await domain.add(b, 2, 'Practice navigation', '');
        const begin = new Date(Date.now() + 60_000);
        const end = new Date(Date.now() + 3600_000);
        const focus = await contest.add(a, 'Focus contest', '', 2, 'acm', begin, end, []);
        const foreign = await contest.add(b, 'Foreign contest', '', 2, 'acm', begin, end, []);
        const route = `/d/${a}/domain/visibility`;
        try {
            const settings = getPageArgs(await agent.get(route).set('Accept', 'application/json').expect(200));
            assert.equal(settings.settings.filter((setting) => setting.family === 'setting_navigation').length, 6);
            assert.equal(settings.settings.filter((setting) => setting.family === 'setting_contest_mode').length, 2);
            assert.deepEqual(settings.focusContests.map((tdoc) => tdoc.docId), [focus.toHexString()]);
            const general = getPageArgs(await agent.get(`/d/${a}/domain/edit`).set('Accept', 'application/json').expect(200));
            assert.ok(general.settings.every((setting) => !['setting_navigation', 'setting_contest_mode'].includes(setting.family)));
            await agent.post(route).set('Accept', 'application/json').send({
                'navigationHidden.problem_main': true, 'navigationHidden.training_main': true, 'navigationHidden.ranking': 'on',
                booleanKeys: { owner: true, _id: true },
            }).expect(200);
            assert.deepEqual((await domain.get(a)).navigationHidden, { problem_main: true, training_main: true, ranking: true });
            assert.equal((await domain.get(a)).owner, 2);
            assert.equal((await domain.get(b)).navigationHidden, undefined);
            const page = getPageArgs(await agent.get(`/d/${a}/p`).set('Accept', 'application/json')
                .set('x-hydro-inject', 'uicontext').expect(200));
            assert.equal(page.UiContext.domain.navigationHidden.problem_main, true);
            assert.equal(page.UiContext.domainId, a);
            await agent.get(`/d/${a}/training`).expect(200);
            await agent.post(route).set('Accept', 'application/json').send({ 'navigationHidden.ranking': [] }).expect(403);
            assert.equal((await domain.get(a)).navigationHidden.ranking, true);
            await agent.post(route).set('Accept', 'application/json').send({ 'navigationHidden.ranking': 'false',
                booleanKeys: { 'navigationHidden.training_main': true } }).expect(200);
            assert.equal((await domain.get(a)).navigationHidden.ranking, false);
            assert.equal((await domain.get(a)).navigationHidden.training_main, false);
            assert.equal((await domain.get(a)).navigationHidden.problem_main, true);
            await agent.post(route).set('Accept', 'application/json').send({ contestMode: true }).expect(200);
            assert.equal((await domain.get(a)).contestMode, true);
            assert.equal((await domain.get(a)).contestFocus, '');
            await agent.post(route).set('Accept', 'application/json').send({ contestMode: true, contestFocus: foreign.toHexString() }).expect(403);
            assert.equal((await domain.get(a)).contestFocus, '');
            await agent.post(route).set('Accept', 'application/json').send({ contestMode: true, contestFocus: focus.toHexString() }).expect(200);
            assert.equal((await domain.get(a)).contestFocus, focus.toHexString());
            await agent.post(route).set('Accept', 'application/json').send({ contestMode: true, contestFocus: '' }).expect(200);
            assert.equal((await domain.get(a)).contestMode, true);
            assert.equal((await domain.get(a)).contestFocus, '');
            await agent.post(route).set('Accept', 'application/json').send({ contestMode: true, contestFocus: focus.toHexString() }).expect(200);
            await agent.get(`/d/${a}/`).expect(302).expect('Location', `/d/${a}/contest`);
            const homepage = await agent.get(`/d/${a}/`).set('Accept', 'application/json').expect(200);
            assert.equal(homepage.body.url, `/d/${a}/contest`);
            assert.equal(homepage.body.contents, undefined);
            await domain.edit(a, { host: ['contest-home.example'] });
            await agent.get('/').set('Host', 'contest-home.example').expect(302).expect('Location', '/contest');
            await agent.get(`/d/${b}/`).expect(200);
            assert.equal((await domain.get(b)).contestMode, undefined);
            await agent.get(`/d/${a}/p`).expect(200);
            await domain.edit(b, { contestFocus: foreign.toHexString() });
            await contest.del(a, focus);
            assert.equal((await domain.coll.findOne({ _id: a })).contestFocus, '', 'deleted focus is cleared persistently');
            assert.equal((await domain.get(a)).contestMode, true, 'deleting the focus does not disable contest mode');
            assert.equal((await domain.get(b)).contestFocus, foreign.toHexString(), 'another domain keeps its focus');
            const replacement = await contest.add(a, 'Replacement focus', '', 2, 'acm', begin, end, []);
            await domain.edit(a, { contestFocus: replacement.toHexString() });
            await contest.del(a, focus);
            assert.equal((await domain.get(a)).contestFocus, replacement.toHexString(), 'deleting an old focus preserves its replacement');
            await contest.del(a, replacement);
            assert.equal((await domain.coll.findOne({ _id: a })).contestFocus, '');
            assert.equal((await domain.get(b)).contestFocus, foreign.toHexString());
            await domain.edit(a, { contestFocus: focus.toHexString() });
            assert.equal((await domain.get(a)).contestFocus, '', 'legacy stale focus falls back safely on reads');
            await agent.post(route).set('Accept', 'application/json').send({ contestMode: false }).expect(200);
            assert.equal((await domain.get(a)).contestFocus, '');
            const restored = getPageArgs(await agent.get(`/d/${a}/`).set('Accept', 'application/json').expect(200));
            assert.ok(Array.isArray(restored.contents));
            assert.equal(restored.domain.navigationHidden.problem_main, true);
        } finally {
            await Promise.all([contest.del(a, focus), contest.del(b, foreign)]);
            await Promise.all([domain.del(a), domain.del(b)]);
        }
    });

    it('Pre-start contest records and scoreboard explain the waiting period without weakening live contest permissions', async () => {
        const { contest, domain, user } = global.Hydro.model;
        const { PERM } = require('../packages/hydrooj/src/model/builtin');
        const domainId = 'contest-waiting';
        const uid = await user.create('contest-waiting@example.com', 'contest-waiting-user', 'secret');
        await domain.add(domainId, 2, 'Waiting contest', '');
        await domain.setRoles(domainId, { guest: 0n, default: PERM.PERM_VIEW | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST
            | PERM.PERM_VIEW_CONTEST_SCOREBOARD | PERM.PERM_VIEW_RECORD });
        await domain.setJoin(domainId, uid, true);
        const tid = await contest.add(domainId, 'Future contest', '', 2, 'acm',
            new Date(Date.now() + 60_000), new Date(Date.now() + 3600_000), []);
        await contest.attend(domainId, tid, uid);
        const contestant = supertest.agent(require('hydrooj').httpServer);
        await contestant.post('/login').send({ uname: 'contest-waiting-user', password: 'secret' }).expect(302);
        const records = `/d/${domainId}/record?tid=${tid}&uidOrName=${uid}`;
        const scoreboard = `/d/${domainId}/contest/${tid}/scoreboard`;
        try {
            await contestant.get(records).set('Accept', 'application/json').expect(403)
                .then((response) => assert.equal(response.body.error.message, 'The contest has not started yet and cannot be viewed.'));
            await contestant.get(scoreboard).set('Accept', 'application/json').expect(403)
                .then((response) => assert.equal(response.body.error.message, 'The contest has not started yet and cannot be viewed.'));
            const editable = getPageArgs(await agent.get(scoreboard).set('Accept', 'application/json').expect(200));
            assert.equal(editable.canEdit, true);
            await contest.edit(domainId, tid, { beginAt: new Date(Date.now() - 60_000) });
            await contestant.get(records).set('Accept', 'application/json').expect(200);
            const readonly = getPageArgs(await contestant.get(scoreboard).set('Accept', 'application/json').expect(200));
            assert.equal(readonly.canEdit, false);
        } finally {
            await contest.del(domainId, tid);
            await domain.del(domainId);
            await user.coll.deleteOne({ _id: uid });
            user._deleteUserCache(true);
        }
    });

    it('Scoreboard exports require actual editing rights and protect private school fields independently', async () => {
        const { contest, domain, user } = global.Hydro.model;
        const { PERM } = require('../packages/hydrooj/src/model/builtin');
        const domainId = 'export-permissions-test';
        const uid = await user.create('export-viewer@example.com', 'export-viewer', 'secret');
        const target = await user.create('export-target@example.com', 'export-target', 'secret');
        const base = PERM.PERM_VIEW | PERM.PERM_VIEW_CONTEST | PERM.PERM_VIEW_CONTEST_SCOREBOARD;
        await domain.add(domainId, 2, 'Export permissions', '');
        await domain.setRoles(domainId, {
            guest: 0n, default: base, editor: base | PERM.PERM_EDIT_CONTEST,
            selfEditor: base | PERM.PERM_EDIT_CONTEST_SELF,
            privateEditor: base | PERM.PERM_EDIT_CONTEST | PERM.PERM_EDIT_CONTEST_SELF | PERM.PERM_VIEW_USER_PRIVATE_INFO,
        });
        await domain.setJoin(domainId, uid, true);
        await user.setById(target, { school: 'PRIVATE_EXPORT_SCHOOL_MARKER' });
        const now = Date.now();
        const tid = await contest.add(domainId, 'Export permissions', '', 2, 'acm',
            new Date(now - 60_000), new Date(now + 3600_000), []);
        await contest.attend(domainId, tid, target);
        const viewer = supertest.agent(require('hydrooj').httpServer);
        await viewer.post('/login').send({ uname: 'export-viewer', password: 'secret' }).expect(302);
        const route = `/d/${domainId}/contest/${tid}/scoreboard`;
        const content = (response: any) => response.text || response.body.toString('utf8');
        try {
            assert.equal(getPageArgs(await viewer.get(route).set('Accept', 'application/json').expect(200)).canEdit, false);
            for (const view of ['html', 'csv', 'ghost']) {
                // eslint-disable-next-line no-await-in-loop
                await viewer.get(`${route}/${view}`).set('Accept', 'application/json').expect(403);
            }
            await viewer.get(`${route}?view=csv`).set('Accept', 'application/json').expect(403);
            await domain.setUserRole(domainId, uid, 'editor');
            assert.equal(getPageArgs(await viewer.get(route).set('Accept', 'application/json').expect(200)).canEdit, true);
            for (const view of ['html', 'csv', 'ghost']) {
                // eslint-disable-next-line no-await-in-loop
                const response = await viewer.get(`${route}/${view}`).expect(200);
                assert.ok(!content(response).includes('PRIVATE_EXPORT_SCHOOL_MARKER'));
            }
            await contest.edit(domainId, tid, { owner: uid });
            await viewer.get(`${route}/ghost`).set('Accept', 'application/json').expect(403);
            await domain.setUserRole(domainId, uid, 'selfEditor');
            const own = await viewer.get(`${route}/ghost`).expect(200);
            assert.ok(!content(own).includes('PRIVATE_EXPORT_SCHOOL_MARKER'));
            await domain.setUserRole(domainId, uid, 'privateEditor');
            assert.ok(content(await viewer.get(`${route}/ghost`).expect(200)).includes('PRIVATE_EXPORT_SCHOOL_MARKER'));
            assert.ok(content(await agent.get(`${route}/ghost`).expect(200)).includes('PRIVATE_EXPORT_SCHOOL_MARKER'));
        } finally {
            await contest.del(domainId, tid);
            await domain.del(domainId);
            await user.coll.deleteMany({ _id: { $in: [uid, target] } });
            user._deleteUserCache(true);
        }
    });

    it('Enabled addons pass profile HTTP regressions', () => runAddonHttpTests('runProfileHttpTests', agent));

    it('Bulk problem download uses the current domain, create permission and independent testdata access', async () => {
        const { domain, problem, user } = global.Hydro.model;
        const { PERM, PRIV } = require('../packages/hydrooj/src/model/builtin');
        const { ZipReader, Uint8ArrayReader, TextWriter } = require('@zip.js/zip.js');
        const domainId = 'problem-export-test';
        const uid = await user.create('export@example.com', 'export-user', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        await domain.add(domainId, 2, 'Problem export test', '');
        const view = PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM;
        await domain.setRoles(domainId, {
            reader: view | PERM.PERM_READ_PROBLEM_DATA,
            creator: view | PERM.PERM_CREATE_PROBLEM,
            exporter: view | PERM.PERM_CREATE_PROBLEM | PERM.PERM_READ_PROBLEM_DATA,
        });
        await domain.setUserRole(domainId, uid, 'exporter', true);
        const p1 = await problem.add(domainId, 'EXPORT1', 'First export', 'Plain statement', uid);
        const p2 = await problem.add(domainId, 'EXPORT2', 'Second export', JSON.stringify({ zh: '中文题面', en: 'Statement' }), 2);
        const hidden = await problem.add(domainId, 'HIDDEN', 'Hidden export', '', 2, [], { hidden: true });
        const referenced = await problem.add(domainId, 'REFERENCE', 'Reference export', '', 2, [], { reference: { domainId: 'system', pid: 1 } });
        const exporter = supertest.agent(require('hydrooj').httpServer);
        await exporter.post('/login').send({ uname: 'export-user', password: 'secret' }).expect(302);
        const route = `/d/${domainId}/p`;
        try {
            await problem.addTestdata(domainId, p1, 'config.yaml', Buffer.from('time: 1s\nmemory: 64m\n'), uid);
            await problem.addTestdata(domainId, p1, '1.in', Buffer.from('1 2\n'), uid);
            await problem.addAdditionalFile(domainId, p2, 'readme.txt', Buffer.from('Attachment'), 2);
            const page = getPageArgs(await exporter.get(route).set('Accept', 'application/json').expect(200));
            assert.equal(page.canCreateProblem, true);
            assert.equal(page.canEditProblem, false);
            const response = await exporter.post(route).send({ operation: 'download', pids: [p2, p1, p1] })
                .buffer(true).parse((res, callback) => {
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => callback(null, Buffer.concat(chunks)));
                    res.on('error', callback);
                }).expect(200).expect('Content-Type', /application\/zip/);
            const zip = new ZipReader(new Uint8ArrayReader(response.body));
            const entries = await zip.getEntries();
            assert.equal(entries.length, 8);
            const read = async (name: string) => entries.find((entry) => entry.filename === name).getData(new TextWriter());
            assert.equal(await read(`${p1}/problem.md`), 'Plain statement');
            assert.equal(await read(`${p2}/problem_zh.md`), '中文题面');
            assert.equal(await read(`${p1}/testdata/1.in`), '1 2\n');
            assert.equal(await read(`${p2}/additional_file/readme.txt`), 'Attachment');
            assert.match(await read(`${p2}/problem.yaml`), /pid: EXPORT2/);
            await zip.close();
            await exporter.post(route).send({ operation: 'download', pids: [p1, hidden] }).expect(404);
            await exporter.post(route).send({ operation: 'download', pids: [referenced] }).expect(400);
            await exporter.post(route).send({ operation: 'download', pids: [] }).expect(403);
            await exporter.post(route).send({ operation: 'download', pids: [p1], domainId: 'system' }).expect(403);
            await domain.setUserRole(domainId, uid, 'reader');
            await exporter.post(route).send({ operation: 'download', pids: [p1] }).expect(403);
            await domain.setUserRole(domainId, uid, 'creator');
            await exporter.post(route).send({ operation: 'download', pids: [p2] }).expect(403);
        } finally {
            await Promise.all([p1, p2, hidden, referenced].map((pid) => problem.del(domainId, pid)));
            await domain.del(domainId);
        }
    });

    it('Domain teams isolate invitations, registration and administrator operations while preserving results', async () => {
        const { contest, domain, problem, user } = global.Hydro.model;
        const { collV } = require('../packages/hydrooj/src/model/user');
        const { PERM, PRIV } = require('../packages/hydrooj/src/model/builtin');
        const a = 'domain-teams-a';
        const b = 'domain-teams-b';
        const member = await user.create('domain-team-member@example.com', 'domain-team-member', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        await Promise.all([domain.add(a, 2, 'Team domain A', ''), domain.add(b, 2, 'Team domain B', '')]);
        const view = PERM.PERM_VIEW | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST;
        await domain.setRoles(a, { participant: view, organizer: view | PERM.PERM_CREATE_CONTEST });
        await domain.setUserRole(a, member, 'participant', true);
        await domain.setUserRole(b, member, 'default', true);
        const memberAgent = supertest.agent(require('hydrooj').httpServer);
        await memberAgent.post('/login').send({ uname: 'domain-team-member', password: 'secret' }).expect(302);
        const teamA = `/d/${a}/contest/team`;
        const teamB = `/d/${b}/contest/team`;
        const pid = await problem.add(a, 'P1', 'Team problem', '', 2);
        const tid = await contest.add(a, 'Scoped teams', '', 2, 'acm', new Date(Date.now() + 60000),
            new Date(Date.now() + 3600000), [pid], false, { allowTeam: true });
        const concurrentTid = await contest.add(a, 'Concurrent team enrollment', '', 2, 'acm', new Date(Date.now() + 60000),
            new Date(Date.now() + 3600000), [pid], false, { allowTeam: true });
        try {
            await agent.post(teamA).send({ operation: 'create', name: 'Team A' }).expect(302);
            await agent.post(teamB).send({ operation: 'create', name: 'Team B' }).expect(302);
            const pageA = getPageArgs(await agent.get(teamA).set('Accept', 'application/json').expect(200));
            const pageB = getPageArgs(await agent.get(teamB).set('Accept', 'application/json').expect(200));
            assert.deepEqual(pageA.mine.map((team) => team.displayName), ['Team A']);
            assert.deepEqual(pageB.mine.map((team) => team.displayName), ['Team B']);
            const team = pageA.mine[0];
            await memberAgent.post(teamB).send({ operation: 'join', code: team.invitationCode }).expect(403);
            await memberAgent.post(teamA).send({ operation: 'join', code: team.invitationCode }).expect(302);
            await memberAgent.get(`${teamA}/manage`).expect(403);
            await memberAgent.get(`${teamA}/${team._id}`).expect(403);
            await memberAgent.get(`/d/${a}/user/${team._id}`).expect(403);
            await agent.get(`${teamB}/${team._id}`).expect(404);
            await agent.get(`/d/${b}/user/${team._id}`).expect(404);
            await agent.get(`/d/${a}/user/${team._id}`).expect(302).expect('Location', `${teamA}/${team._id}`);
            await agent.post(`${teamB}/manage`).send({ operation: 'rename', vuid: team._id, name: 'Wrong domain' }).expect(404);
            await agent.post(`${teamB}/manage`).send({ operation: 'disband', vuid: team._id }).expect(404);
            await agent.post(teamB).send({ operation: 'rename', vuid: team._id, name: 'Wrong domain' }).expect(403);
            await agent.post(`${teamA}/manage`).send({ domainId: b, operation: 'disband', vuid: team._id }).expect(403);
            await agent.post(`/d/${b}/contest/${tid}`).send({ operation: 'attend', vuid: team._id }).expect(404);
            await agent.post(`/d/${a}/contest/${tid}`).send({ operation: 'attend', vuid: team._id }).expect(302);
            await domain.setUserRole(a, member, 'organizer');
            const managed = getPageArgs(await memberAgent.get(`${teamA}/manage`).set('Accept', 'application/json').expect(200));
            assert.equal(managed.teams[0]._id, team._id);
            assert.equal(managed.pageCount, 1);
            await memberAgent.post(`${teamA}/manage`).send({ operation: 'rename', vuid: team._id, name: 'Renamed A' }).expect(200);
            const scoreboard = getPageArgs(await agent.get(`/d/${a}/contest/${tid}/scoreboard`).set('Accept', 'application/json').expect(200));
            assert.equal(scoreboard.udict[team._id].displayName, 'Renamed A');
            assert.equal(scoreboard.udict[team._id].isTeam, true);
            assert.deepEqual(scoreboard.udict[team._id].teamMembers, [2, member]);
            const rid = await global.Hydro.model.record.add(a, pid, member, '_', 'preserved team code', false,
                { contest: tid, contestUid: team._id });
            const journal = [{ rid, pid, score: 100, status: STATUS.STATUS_ACCEPTED }];
            await contest.setStatus(a, tid, team._id, { score: 100, journal });
            await contest.setStatus(a, tid, member, { proctorEnded: true, proctorLogUploaded: true });
            await memberAgent.post(teamA).send({ operation: 'leave', vuid: team._id }).expect(302);
            assert.deepEqual((await contest.getStatus(a, tid, team._id)).members, [2]);
            assert.equal((await contest.getStatus(a, tid, team._id)).proctorMembers?.[member], undefined);
            assert.equal(await contest.getTeamVid(a, tid, member), null);
            const historicRecord = await global.Hydro.model.record.get(a, rid);
            assert.equal(historicRecord.contestUid, team._id);
            assert.equal(await contest.getRecordContestUid(historicRecord), team._id);
            assert.equal(await contest.getRecordContestUid({ ...historicRecord, contestUid: undefined }), team._id);
            assert.equal(await contest.isOwnOrTeammateRecord(a, historicRecord, 2), true);
            await memberAgent.post(`/d/${a}/contest/${tid}`).send({ operation: 'attend' }).expect(302);
            await memberAgent.post(teamA).send({ operation: 'join', code: team.invitationCode }).expect(403);
            assert.ok(!(await user.getTeamById(a, team._id)).members.includes(member));
            assert.deepEqual((await contest.getStatus(a, tid, team._id)).members, [2]);
            await contest.cancelAttend(a, tid, member);
            await contest.setStatus(a, tid, member, { proctorEnded: true, proctorLogUploaded: true });
            await memberAgent.post(teamA).send({ operation: 'join', code: team.invitationCode }).expect(302);
            assert.equal(await contest.getTeamVid(a, tid, member), team._id);
            assert.deepEqual((await contest.getStatus(a, tid, team._id)).members, [2, member]);
            assert.equal((await contest.getStatus(a, tid, team._id)).proctorMembers[member].proctorLogUploaded, true);
            await agent.post(teamA).send({ operation: 'leave', vuid: team._id, uid: member }).expect(302);
            assert.equal(await contest.getTeamVid(a, tid, member), null);
            await memberAgent.post(teamA).send({ operation: 'join', code: team.invitationCode }).expect(302);
            const retained = await contest.getStatus(a, tid, team._id);
            assert.equal(retained.score, 100);
            assert.deepEqual(retained.journal, journal);
            assert.equal((await global.Hydro.model.record.get(a, rid)).code, 'preserved team code');
            await memberAgent.post(teamA).send({ operation: 'leave', vuid: team._id }).expect(302);
            await Promise.all([
                memberAgent.post(teamA).send({ operation: 'join', code: team.invitationCode }).expect(302),
                agent.post(`/d/${a}/contest/${concurrentTid}`).send({ operation: 'attend', vuid: team._id }).expect(302),
            ]);
            assert.deepEqual((await contest.getStatus(a, concurrentTid, team._id)).members, (await user.getTeamById(a, team._id)).members);
            const attendeePage = getPageArgs(await agent.get(`/d/${a}/contest/${tid}/user`).set('Accept', 'application/json').expect(200));
            assert.equal(attendeePage.canManageTeams, true);
            await agent.post(`/d/${a}/contest/${tid}/user`).send({ operation: 'rank', uid: team._id }).expect(302);
            assert.equal((await contest.getStatus(a, tid, team._id)).unrank, true);
            await memberAgent.post(`${teamA}/manage`).send({ operation: 'disband', vuid: team._id }).expect(200);
            await memberAgent.post(teamA).send({ operation: 'join', code: team.invitationCode }).expect(403);
            assert.equal((await user.getTeamById(a, team._id)), null);
            const archived = getPageArgs(await agent.get(`${teamA}/${team._id}`).set('Accept', 'application/json').expect(200));
            assert.ok(archived.team.disbandedAt);
            assert.deepEqual((await contest.getStatus(a, tid, team._id)).members, [2, member]);
            assert.equal((await contest.getStatus(a, tid, team._id)).attend, 1);
            assert.equal((await user.getVusersByMember(2, undefined, b))[0].displayName, 'Team B');
        } finally {
            await contest.del(a, tid);
            await contest.del(a, concurrentTid);
            await problem.del(a, pid);
            await Promise.all([domain.del(a), domain.del(b)]);
            await collV.deleteMany({ domainId: { $in: [a, b] } });
        }
    });

    it('Legacy global teams split by historical domains with resumable identities and unchanged scores', async () => {
        const { contest, domain, record, user } = global.Hydro.model;
        const { collV } = require('../packages/hydrooj/src/model/user');
        const a = 'legacy-teams-a';
        const b = 'legacy-teams-b';
        await Promise.all([domain.add(a, 2, 'Legacy A', ''), domain.add(b, 2, 'Legacy B', '')]);
        const legacy = await user.createVuser('team:2:legacy-domain-split', { displayName: 'Legacy team', members: [2] });
        const unused = await user.createVuser('team:2:legacy-never-attended', { displayName: 'Unused team', members: [2] });
        const start = new Date(Date.now() - 60000);
        const end = new Date(Date.now() + 3600000);
        const [ta, tb] = await Promise.all([
            contest.add(a, 'Legacy A', '', 2, 'acm', start, end, [], false, { allowTeam: true }),
            contest.add(b, 'Legacy B', '', 2, 'acm', start, end, [], false, { allowTeam: true }),
        ]);
        // Seed pre-migration records directly: current registration rejects cross-domain teams.
        const { document } = global.Hydro.model;
        await Promise.all([
            document.setStatus(a, document.TYPE_CONTEST, ta, legacy, { attend: 1, members: [2], displayName: 'Legacy team', score: 100 }),
            document.setStatus(b, document.TYPE_CONTEST, tb, legacy, { attend: 1, members: [2], displayName: 'Legacy team', score: 80 }),
        ]);
        const legacyRid = await record.add(b, 1, legacy, '_', 'legacy code', false, { contest: tb, type: 'judge' });
        const realRid = await record.add(b, 1, 2, '_', 'individual code', false, { contest: tb, type: 'judge' });
        try {
            await Promise.all([user.migrateLegacyTeams(), user.migrateLegacyTeams()]);
            const one = (await user.getVusersByMember(2, undefined, a))[0];
            const two = (await user.getVusersByMember(2, undefined, b))[0];
            assert.ok(one && two);
            assert.notEqual(one._id, two._id);
            assert.equal((await contest.getStatus(a, ta, one._id)).score, 100);
            assert.equal((await contest.getStatus(b, tb, two._id)).score, 80);
            assert.deepEqual((await contest.getStatus(b, tb, two._id)).members, [2]);
            assert.equal((await record.get(b, legacyRid)).uid, two._id);
            assert.equal((await record.get(b, realRid)).uid, 2);
            assert.equal((await record.get(b, legacyRid)).code, 'legacy code');
            assert.equal((await user.getTeamById('system', unused))._id, unused);
            assert.equal(two.captainId, 2, 'legacy captain authority is retained when cloning');
            await collV.updateOne({ _id: legacy }, { $set: { _teamMigrationDomains: [a, b] } });
            await Promise.all([user.migrateLegacyTeams(), user.migrateLegacyTeams()]);
            assert.equal(await collV.countDocuments({ _legacyTeamId: legacy }), 2);
            assert.equal((await user.getVusersByMember(2, undefined, b))[0]._id, two._id);
            assert.equal((await collV.findOne({ _id: legacy }))._teamMigrationDomains, undefined);
        } finally {
            await Promise.all([contest.del(a, ta), contest.del(b, tb)]);
            await Promise.all([domain.del(a), domain.del(b)]);
            await collV.deleteMany({ _legacyTeamId: { $in: [legacy, unused] } });
        }
    });

    it('Ordinary contestants receive private self-test output for hidden OI problems over HTTP and WebSocket', async () => {
        const { contest, domain, problem, user, record } = global.Hydro.model;
        const { PERM, PRIV } = require('../packages/hydrooj/src/model/builtin');
        const WebSocket = require('ws');
        const domainId = 'contest-pretest-test';
        const uid = await user.create('pretest@example.com', 'pretest-user', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        await domain.add(domainId, 2, 'Pretest test', '');
        await domain.setRoles(domainId, { guest: 0n, default: PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM
            | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST | PERM.PERM_SUBMIT_PROBLEM });
        await domain.setJoin(domainId, uid, true);
        const pid = await problem.add(domainId, 'H1', 'Hidden contest problem', 'Statement', 2);
        await problem.edit(domainId, pid, { hidden: true });
        const now = Date.now();
        const tid = await contest.add(domainId, 'OI self-test', '', 2, 'oi', new Date(now - 60_000), new Date(now + 3600_000), [pid]);
        await contest.attend(domainId, tid, uid, { startAt: new Date(now - 1000) });
        const initialSubmissions = (await user.getById(domainId, uid)).nSubmit;
        const rid = await record.add(domainId, pid, uid, '_', 'own code', false, { type: 'pretest', input: ['1 2'], contest: tid });
        const participant = supertest.agent(require('hydrooj').httpServer);
        const login = await participant.post('/login').send({ uname: 'pretest-user', password: 'secret' }).expect(302);
        let socket;
        try {
            assert.equal((await user.getById(domainId, uid)).hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN), false);
            const doc = await record.get(domainId, rid);
            assert.equal(doc.contest.toHexString(), record.RECORD_PRETEST.toHexString());
            assert.equal(doc.pretestContest.toHexString(), tid.toHexString());
            await record.update(domainId, rid, { status: STATUS.STATUS_ACCEPTED,
                testCases: [{ id: 1, subtaskId: 1, status: STATUS.STATUS_ACCEPTED, score: 0, time: 1, memory: 1, message: '3' }] });
            const path = `/d/${domainId}/record/${rid}`;
            const page = await participant.get(path).set('Accept', 'application/json').expect(200);
            assert.equal(page.body.rdoc.testCases[0].message, '3');
            const { port } = require('hydrooj').httpServer.address();
            const cookie = login.headers['set-cookie'].map((value: string) => value.split(';')[0]).join('; ');
            const update = await new Promise<any>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('self-test WebSocket timed out')), 5000);
                socket = new WebSocket(`ws://127.0.0.1:${port}/d/${domainId}/record-detail-conn?rid=${rid}&noTemplate=true`,
                    { headers: { Cookie: cookie } });
                socket.on('error', (error: Error) => {
                    clearTimeout(timer);
                    reject(error);
                });
                socket.on('close', () => {
                    clearTimeout(timer);
                    reject(new Error('self-test WebSocket closed without a result'));
                });
                socket.on('message', (data: Buffer) => {
                    if (data.toString() === 'ping') return socket.send('pong');
                    const payload = JSON.parse(data.toString());
                    clearTimeout(timer);
                    if (payload.error) reject(new Error(JSON.stringify(payload.error)));
                    else resolve(payload);
                    return undefined;
                });
            });
            assert.equal(update.rdoc.status, STATUS.STATUS_ACCEPTED);
            assert.equal(update.rdoc.testCases[0].message, '3');
            await agent.get(path).set('Accept', 'application/json').expect(403);
            await participant.get(`/d/system/record/${rid}`).set('Accept', 'application/json').expect(404);
            await contest.cancelAttend(domainId, tid, uid);
            await participant.get(path).set('Accept', 'application/json').expect(403);
            assert.equal((await user.getById(domainId, uid)).nSubmit, initialSubmissions);
        } finally {
            socket?.terminate();
            await record.coll.deleteMany({ domainId });
            await contest.del(domainId, tid);
            await domain.del(domainId);
        }
    });

    it('监考自测正确绑定比赛，提前或自然结束后仍可上传加密日志并取得回执', async () => {
        const { contest, domain, problem, user, record, storage } = global.Hydro.model;
        const { ObjectId } = require('mongodb');
        const { PERM, PRIV } = require('../packages/hydrooj/src/model/builtin');
        const proctor = require('../packages/hydrooj/src/model/proctor');
        const { canonical, digest, secret, signedPayload, verifyPayload } = require('../packages/hydrooj/src/lib/proctor');
        const { constants, createCipheriv, publicEncrypt, randomBytes } = require('crypto');
        const WebSocket = require('ws');
        const domainId = 'proctor-pretest-finish';
        const rateCounters = require('../packages/hydrooj/src/service/db').default.collection('opcount');
        await rateCounters.deleteMany({ op: 'global' });
        const previous = await proctor.getConfig();
        const uid = await user.create('proctor-pretest@example.com', 'proctor-pretest-user', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        await domain.add(domainId, 2, 'Proctor pretest', '');
        await domain.setRoles(domainId, { guest: 0n, default: PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM
            | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST | PERM.PERM_SUBMIT_PROBLEM });
        await domain.setJoin(domainId, uid, true);
        const pid = await problem.add(domainId, 'H1', 'Hidden proctored problem', 'Statement', 2);
        await problem.edit(domainId, pid, { hidden: true, config: 'type: default\n' });
        const participant = supertest.agent(require('hydrooj').httpServer);
        const login = await participant.post('/login').send({ uname: 'proctor-pretest-user', password: 'secret' }).expect(302);
        const cookie = login.headers['set-cookie'].map((value: string) => value.split(';')[0]).join('; ');
        const tids = [];
        let socket;
        try {
            const keys = await proctor.generateKeys();
            await proctor.saveConfig({ ...previous, enabled: true, requiredVersion: '1.0.0' });
            for (const ending of ['early', 'natural']) {
                const now = Date.now();
                const tid = await contest.add(domainId, `Proctor ${ending}`, '', 2, 'oi',
                    new Date(now - 60_000), new Date(now + 3600_000), [pid], false, { proctorEnabled: true });
                tids.push(tid);
                await contest.attend(domainId, tid, uid, { startAt: new Date(now - 1000) });
                const rid = await record.add(domainId, pid, uid, '_', 'private self-test', false, { type: 'pretest', contest: tid, input: ['1'] });
                const identityPath = `/d/${domainId}/proctor/identity`;
                for (const request of [{ rid }, { rid, tid }]) {
                    const identity = await participant.post(identityPath).set('Accept', 'application/json')
                        .send({ ...request, clientNonce: secret() }).expect(200);
                    assert.equal(identity.body.payload.tid, tid.toHexString());
                    assert.equal(identity.body.payload.proctorEnabled, true);
                    assert.ok(verifyPayload(identity.body.payload, identity.body.signature, keys.signingPublicKey));
                }
                await participant.post(identityPath).send({ rid, tid: '1234567890abcdef12345678', clientNonce: secret() }).expect(403);
                const device = generateKeyPairSync('ed25519');
                const fingerprint = 'c'.repeat(64);
                const origin = 'http://localhost';
                const challenge = await proctor.challenge({ domainId, uid, tid }, await contest.get(domainId, tid), {
                    version: '1.0.0', fingerprint, clientNonce: secret(),
                    publicKey: device.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
                }, origin);
                const session = await proctor.handshake({ domainId, uid, tid }, challenge.payload.challengeId,
                    signedPayload(challenge.payload, device.privateKey), '127.0.0.1');
                const headers = (action: string, method: string, path: string, data: any) => {
                    const payload = { protocol: 'hydro-proctor/1', action, method, path, tokenHash: digest(session.token),
                        fingerprint, version: '1.0.0', payloadHash: digest(canonical(data)), timestamp: Date.now(), nonce: secret() };
                    return { 'x-proctor-token': session.token, 'x-proctor-proof': Buffer.from(JSON.stringify({ payload,
                        signature: signedPayload(payload, device.privateKey) })).toString('base64url') };
                };
                if (ending === 'early') {
                    const submitPath = `/d/${domainId}/p/H1/submit`;
                    const submission = { pid, lang: 'cc', code: 'int main(){}', pretest: true, input: [''], fileHash: '' };
                    for (const input of [[''], ['1 2\n'], ['', '3\n', '']]) {
                        const body = { ...submission, input };
                        const submitted = await participant.post(`${submitPath}?tid=${tid}`).set('Accept', 'application/json')
                            .set(headers('submit', 'POST', submitPath, body)).send(body).expect(200);
                        assert.ok(submitted.body.rid);
                        const selfTest = await record.get(domainId, new ObjectId(submitted.body.rid));
                        assert.deepEqual(selfTest.input, input);
                        assert.equal(selfTest.pretestContest.toHexString(), tid.toHexString());
                    }
                    for (const changed of [{ input: ['changed'] }, { code: 'int main(){return 1;}' }]) {
                        const rejected = await participant.post(`${submitPath}?tid=${tid}`).set('Accept', 'application/json')
                            .set(headers('submit', 'POST', submitPath, submission)).send({ ...submission, ...changed }).expect(403);
                        assert.equal(rejected.body.error.params[0], 'Invalid proctor request proof.');
                    }
                    const formal = { ...submission, pretest: false, input: [] };
                    const submitted = await participant.post(`${submitPath}?tid=${tid}`).set('Accept', 'application/json')
                        .set(headers('submit', 'POST', submitPath, formal)).send(formal).expect(200);
                    assert.equal(submitted.body.tid, tid.toHexString());
                }
                const path = `/d/${domainId}/record/${rid}`;
                await participant.get(path).set('Accept', 'application/json').expect(403);
                const result = await participant.get(path).set('Accept', 'application/json')
                    .set(headers('record_view', 'GET', path, { rid: rid.toHexString() })).expect(200);
                assert.equal(result.body.rdoc.code, 'private self-test');
                const socketPath = `/d/${domainId}/record-detail-conn`;
                const { port } = require('hydrooj').httpServer.address();
                const update = await new Promise<any>((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('监考自测结果连接超时')), 5000);
                    socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}?rid=${rid}&noTemplate=true`, {
                        headers: { Cookie: cookie, ...headers('record_view', 'GET', socketPath, { rid: rid.toHexString() }) },
                    });
                    socket.on('error', (error: Error) => { clearTimeout(timer); reject(error); });
                    socket.on('message', (data: Buffer) => {
                        if (data.toString() === 'ping') return socket.send('pong');
                        clearTimeout(timer);
                        const body = JSON.parse(data.toString());
                        if (body.error) reject(new Error(JSON.stringify(body.error)));
                        else resolve(body);
                        return undefined;
                    });
                });
                assert.equal(update.rdoc.code, 'private self-test');
                socket.terminate();
                if (ending === 'early') {
                    await participant.post(`/d/${domainId}/contest/${tid}`).send({ operation: 'early_end' }).expect(302);
                } else await contest.edit(domainId, tid, { endAt: new Date(Date.now() - 1000) });
                const submitPath = `/d/${domainId}/p/H1/submit`;
                const submission = { pid, lang: 'cc', code: 'int main(){}', pretest: false, input: [], fileHash: '' };
                await participant.post(`${submitPath}?tid=${tid}`).set(headers('submit', 'POST', submitPath, submission))
                    .send({ tid, lang: submission.lang, code: submission.code }).expect(403);
                const route = `/d/${domainId}/contest/${tid}/proctor`;
                assert.equal((await contest.getStatus(domainId, tid, uid)).proctorLogUploaded, undefined);
                const finished = await participant.post(route).set(headers('finish', 'POST', route, {})).send({ operation: 'finish' }).expect(200);
                assert.equal(finished.body.logUploaded, false);
                assert.notEqual((await contest.getStatus(domainId, tid, uid)).proctorLogUploaded, true);
                const key = randomBytes(32);
                const iv = randomBytes(12);
                const cipher = createCipheriv('aes-256-gcm', key, iv);
                cipher.setAAD(Buffer.from(`HYDRO-PROCTOR-LOG/1:${keys.keyId}`));
                const ciphertext = Buffer.concat([cipher.update(`FINISH ${tid}\n`), cipher.final()]);
                const header = { keyId: keys.keyId, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'),
                    wrappedKey: publicEncrypt({ key: keys.encryptionPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING,
                        oaepHash: 'sha256' }, key).toString('base64url') };
                key.fill(0);
                const file = Buffer.concat([Buffer.from(`HYDRO-PROCTOR-LOG/1\n${JSON.stringify(header)}\n`), ciphertext]);
                const filename = `${ending}.hplog`;
                await participant.post(route).set(headers('upload', 'POST', route, { filename, size: file.length, sha256: digest(file) }))
                    .field('operation', 'upload').attach('file', file, filename).expect(200);
                const status = await participant.get(route).expect(200);
                assert.equal(status.body.state, 'complete');
                assert.equal(status.body.logUploaded, true);
                assert.equal((await contest.getStatus(domainId, tid, uid)).proctorLogUploaded, true);
            }
        } finally {
            socket?.terminate();
            const logs = await proctor.logs.find({ domainId }).toArray();
            if (logs.length) await storage.del(logs.map((entry) => entry.path), uid);
            await proctor.logs.deleteMany({ domainId });
            await proctor.saveConfig(previous);
            await record.coll.deleteMany({ domainId });
            for (const tid of tids) await contest.del(domainId, tid);
            await domain.del(domainId);
            await rateCounters.deleteMany({ op: 'global' });
        }
    });

    it('Team contests preserve individual records, replay permissions, timers and proctor evidence', async () => {
        const { contest, domain, problem, user, record } = global.Hydro.model;
        const { PRIV } = require('../packages/hydrooj/src/model/builtin');
        const { getRecordAccess } = require('../packages/hydrooj/src/lib/record-access');
        const proctor = require('../packages/hydrooj/src/model/proctor');
        const { canonical, digest, secret, signedPayload } = require('../packages/hydrooj/src/lib/proctor');
        const previousProctorConfig = await proctor.getConfig();
        const domainId = 'team-upgrade-test';
        const member = await user.create('teammate@example.com', 'teammate', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        const outsider = await user.create('outsider@example.com', 'outsider', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        await domain.add(domainId, 2, 'Team upgrade test', '');
        await Promise.all([domain.setJoin(domainId, member, true), domain.setJoin(domainId, outsider, true)]);
        const pid = await problem.add(domainId, 'T1', 'Team problem', 'Statement', 2);
        const now = Date.now();
        const tid = await contest.add(domainId, 'Team contest', '', 2, 'acm', new Date(now + 60_000),
            new Date(now + 3_600_000), [pid], false, { allowTeam: true });
        const route = `/d/${domainId}/contest/${tid}`;
        const teamRoute = `/d/${domainId}/contest/team`;
        const memberAgent = supertest.agent(require('hydrooj').httpServer);
        await memberAgent.post('/login').send({ uname: 'teammate', password: 'secret' }).expect(302);
        try {
            await agent.post(teamRoute).send({ operation: 'create', name: 'Upgrade team' }).expect(302);
            const [team] = await user.getVusersByMember(2, undefined, domainId);
            const teamPage = await agent.get(teamRoute).expect(200);
            const teamCode = getPageArgs(teamPage).mine.find((doc) => doc._id === team._id).invitationCode;
            assert.match(teamCode, /^[A-HJ-NP-Z2-9]{8}$/);
            await memberAgent.post(teamRoute).send({ operation: 'join', code: teamCode.toLowerCase() }).expect(302);
            await memberAgent.post(teamRoute).send({ operation: 'join', code: teamCode }).expect(403);
            await agent.post(teamRoute).send({ operation: 'invite', vuid: team._id, uidOrName: 'teammate' }).expect(405);
            const view = getPageArgs(await agent.get(route).set('Accept', 'application/json').expect(200));
            assert.ok(view.team_vdocs.some((doc) => doc._id === team._id));
            await agent.post(route).send({ operation: 'attend', vuid: team._id }).expect(302);
            assert.equal(await contest.getTeamVid(domainId, tid, member), team._id);
            await memberAgent.post(route).send({ operation: 'attend' }).expect(403);
            await agent.post(`${route}/user`).send({ operation: 'remove_user', uid: team._id }).expect(302);
            assert.equal(await contest.getTeamVid(domainId, tid, member), null);
            await agent.post(route).send({ operation: 'attend', vuid: team._id }).expect(302);
            // 管理员添加参赛者也不能绕过团队/个人的冲突检查。
            await agent.post(`${route}/user`).send({ operation: 'add_user', uids: [member] }).expect(403);
            const conflictTeam = await user.createVuser('team:2:conflict-proctor', {
                domainId, captainId: 2, members: [2, member], displayName: 'Conflicting team',
            });
            await agent.post(`${route}/user`).send({ operation: 'add_user', uids: [conflictTeam] }).expect(403);
            await contest.edit(domainId, tid, { beginAt: new Date(now - 60_000) });
            await agent.post(`${route}/user`).send({ operation: 'remove_user', uid: team._id }).expect(403);
            const rid = await record.add(domainId, pid, member, '_', 'team code', false, { contest: tid });
            const rdoc = await record.get(domainId, rid);
            const teammateUser = await user.getById(domainId, 2);
            const teammateAccess = await getRecordAccess({ user: teammateUser }, rdoc);
            assert.equal(teammateAccess.canViewCode, true);
            assert.equal(teammateAccess.tsdoc.uid, team._id);
            const outsiderUser = await user.getById(domainId, outsider);
            await assert.rejects(getRecordAccess({ user: outsiderUser }, rdoc));
            await memberAgent.get(`${route}/problems`).set('Accept', 'application/json').expect(200);
            await runAddonHttpTests('runTeamActivityTests', agent, { domainId, tid, member, pid });
            await contest.edit(domainId, tid, { proctorEnabled: true });
            const memberView = getPageArgs(await memberAgent.get(route).set('Accept', 'application/json').expect(200));
            assert.equal(memberView.canEndContest, false);
            assert.equal(memberView.tsdoc.proctorTeam.total, 2);
            assert.equal(memberView.tsdoc.proctorTeam.uploaded, 0);
            await memberAgent.post(route).send({ operation: 'early_end' }).expect(403);
            await memberAgent.get(`/d/${domainId}/record/${rid}`).set('Accept', 'application/json').expect(403);
            await memberAgent.get(`/d/${domainId}/record/${rid}?download=true`).expect(403);
            // 使用真实握手、签名与 MongoDB 会话验证普通成员读取队友代码。
            await proctor.generateKeys();
            await proctor.saveConfig({ ...previousProctorConfig, enabled: true, requiredVersion: '1.0.0' });
            const client = generateKeyPairSync('ed25519');
            const identity = { domainId, tid, uid: member };
            const fingerprint = 'b'.repeat(64);
            const challenge = await proctor.challenge(identity, await contest.get(domainId, tid), {
                version: '1.0.0', fingerprint, clientNonce: secret(),
                publicKey: client.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
            }, 'http://localhost');
            const session = await proctor.handshake(identity, challenge.payload.challengeId,
                signedPayload(challenge.payload, client.privateKey), '127.0.0.1');
            const sharedRid = await record.add(domainId, pid, 2, '_', 'shared teammate code', false,
                { contest: tid, contestUid: team._id });
            const sharedPath = `/d/${domainId}/record/${sharedRid}`;
            const headers = (path: string, recordId = sharedRid) => {
                const payload = { protocol: 'hydro-proctor/1', action: 'record_view', method: 'GET', path,
                    tokenHash: digest(session.token), fingerprint, version: '1.0.0',
                    payloadHash: digest(canonical({ rid: recordId.toHexString() })), timestamp: Date.now(), nonce: secret() };
                return { 'x-proctor-token': session.token, 'x-proctor-proof': Buffer.from(JSON.stringify({ payload,
                    signature: signedPayload(payload, client.privateKey) })).toString('base64url') };
            };
            const once = headers(sharedPath);
            const shared = await memberAgent.get(sharedPath).set('Accept', 'application/json').set(once).expect(200);
            assert.equal(shared.body.rdoc.code, 'shared teammate code');
            await memberAgent.get(sharedPath).set(once).expect(403);
            await memberAgent.get(sharedPath).set(headers(sharedPath, rid)).expect(403);
            const download = await memberAgent.get(`${sharedPath}?download=true`).set(headers(sharedPath)).expect(200);
            assert.equal(download.text, 'shared teammate code');
            await proctor.closeAttempt(await proctor.sessions.findOne({ _id: digest(session.token) }));
            await memberAgent.get(sharedPath).set(headers(sharedPath)).expect(403);

            await contest.setStatus(domainId, tid, member, { proctorEnded: true, proctorLogUploaded: false });
            assert.equal((await contest.getAndListStatus(domainId, tid))[1].length, 0);
            await contest.setStatus(domainId, tid, member, { proctorLogUploaded: true });
            assert.equal((await contest.getAndListStatus(domainId, tid))[1].length, 1);
            const progress = getPageArgs(await memberAgent.get(route).set('Accept', 'application/json').expect(200));
            assert.equal(progress.tsdoc.proctorLogUploaded, true);
            assert.equal(progress.tsdoc.proctorTeam.uploaded, 1);
            assert.equal(progress.tsdoc.proctorTeam.pending[0].uid, 2);
            await contest.edit(domainId, tid, { endAt: new Date(now - 1) });
            assert.equal((await contest.getAndListStatus(domainId, tid))[1].length, 0);
            await contest.setStatus(domainId, tid, 2, { proctorEnded: true, proctorLogUploaded: true });
            const complete = getPageArgs(await memberAgent.get(route).set('Accept', 'application/json').expect(200));
            assert.equal(complete.tsdoc.proctorTeam.uploaded, 2);
            assert.deepEqual(complete.tsdoc.proctorTeam.pending, []);

            assert.equal((await contest.getAndListStatus(domainId, tid))[1].length, 1);
            await contest.setStatus(domainId, tid, member, { proctorLogUploaded: false });
            assert.equal((await contest.getAndListStatus(domainId, tid))[1].length, 0);
            await contest.edit(domainId, tid, { endAt: new Date(now + 3_600_000) });
            const captainView = getPageArgs(await agent.get(route).set('Accept', 'application/json').expect(200));
            assert.equal(captainView.canEndContest, true);
            await agent.post(route).send({ operation: 'early_end' }).expect(302);
            assert.ok((await contest.getStatus(domainId, tid, team._id)).endAt <= new Date());
            assert.equal((await contest.getStatus(domainId, tid, member)).proctorLogUploaded, false);
        } finally {
            await proctor.saveConfig(previousProctorConfig);
            await contest.del(domainId, tid);
            await problem.del(domainId, pid);
            await domain.del(domainId);
        }
    });

    it('Team codes migrate existing teams, revoke on reset and enforce atomic capacity without private messages', async () => {
        const { domain, user } = global.Hydro.model;
        const { collV } = require('../packages/hydrooj/src/model/user');
        const { PRIV } = require('../packages/hydrooj/src/model/builtin');
        const domainId = 'team-code-route-test';
        await domain.add(domainId, 2, 'Team code test', '');
        await domain.edit(domainId, { config: { limit$team_members: 2 } });
        const first = await user.create('code-first@example.com', 'code-first', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        const second = await user.create('code-second@example.com', 'code-second', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        await Promise.all([domain.setUserRole(domainId, first, 'root'), domain.setUserRole(domainId, second, 'root')]);
        await Promise.all([domain.setJoin(domainId, first, true), domain.setJoin(domainId, second, true)]);
        const firstAgent = supertest.agent(require('hydrooj').httpServer);
        const secondAgent = supertest.agent(require('hydrooj').httpServer);
        await firstAgent.post('/login').send({ uname: 'code-first', password: 'secret' }).expect(302);
        await secondAgent.post('/login').send({ uname: 'code-second', password: 'secret' }).expect(302);
        const route = `/d/${domainId}/contest/team`;
        const vuid = await user.createVuser('team:2:code-test', { domainId, displayName: 'Code team', members: [2], invite: [first] });
        try {
            const page = await agent.get(route).expect(200);
            const team = getPageArgs(page).mine.find((doc) => doc._id === vuid);
            const code = team.invitationCode;
            assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
            assert.equal((await user.getVuserById(vuid)).invite, undefined);
            const index = (await collV.indexes()).find((item) => item.name === 'team_join_code');
            assert.equal(index.unique, true);
            assert.equal(index.sparse, true);
            const outsiderPage = await firstAgent.get(route).expect(200);
            assert.equal(getPageArgs(outsiderPage).mine.length, 0);
            assert.ok(!outsiderPage.text.includes(code));
            await firstAgent.post(route).send({ operation: 'reset_code', vuid }).expect(403);
            await agent.post(route).send({ operation: 'reset_code', vuid }).expect(302);
            const reset = (await user.getVuserById(vuid))._teamJoinCode;
            assert.notEqual(reset, code);
            await firstAgent.post(route).send({ operation: 'join', code }).expect(403);
            const results = await Promise.all([
                firstAgent.post(route).send({ operation: 'join', code: reset.toLowerCase() }),
                secondAgent.post(route).send({ operation: 'join', code: reset }),
            ]);
            assert.deepEqual(results.map((result) => result.status).sort(), [302, 403]);
            assert.equal((await user.getVuserById(vuid)).members.length, 2);
            const memberAgent = results[0].status === 302 ? firstAgent : secondAgent;
            const memberId = results[0].status === 302 ? first : second;
            const memberPage = getPageArgs(await memberAgent.get(route).expect(200)).mine.find((doc) => doc._id === vuid);
            assert.equal(memberPage.captainId, 2);
            assert.equal(memberPage.canManage, false);
            assert.equal(memberPage.canLeave, true);
            await memberAgent.post(route).send({ operation: 'leave', vuid, uid: 2 }).expect(403);
            await memberAgent.post(route).send({ operation: 'rename', vuid, name: 'Hijacked' }).expect(403);
            await memberAgent.post(route).send({ operation: 'reset_code', vuid }).expect(403);
            await agent.post(route).send({ operation: 'leave', vuid }).expect(403);
            assert.deepEqual((await user.getVuserById(vuid)).members, [2, memberId]);
            const publicUser = await agent.get('/api/user').query({ args: JSON.stringify({ id: vuid }) }).expect(200);
            assert.ok(!publicUser.text.includes(reset));
            const guest = supertest.agent(require('hydrooj').httpServer);
            const unauthorized = await guest.post('/d/system/contest/team').set('Accept', 'application/json')
                .send({ operation: 'join', code: reset }).expect(200);
            assert.ok(unauthorized.body.url.includes('/login'));
            assert.equal((await user.getVuserById(vuid)).members.length, 2);
            await memberAgent.post(route).send({ operation: 'leave', vuid }).expect(302);
            assert.deepEqual((await user.getVuserById(vuid)).members, [2]);
            await memberAgent.post(route).send({ operation: 'join', code: reset }).expect(302);
            await agent.post(route).send({ operation: 'rename', vuid, name: 'Captain renamed' }).expect(302);
            assert.equal((await user.getVuserById(vuid)).displayName, 'Captain renamed');
            await agent.post(route).send({ operation: 'leave', vuid, uid: memberId }).expect(302);
            assert.deepEqual((await user.getVuserById(vuid)).members, [2]);
            await agent.post(route).send({ operation: 'leave', vuid }).expect(302);
            const closed = await user.getVuserById(vuid);
            assert.deepEqual(closed.members, []);
            assert.equal(closed._teamJoinCode, undefined);
            await memberAgent.post(route).send({ operation: 'join', code: reset }).expect(403);
        } finally {
            await collV.deleteOne({ _id: vuid });
            await domain.del(domainId);
        }
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
            const authorization = await agent.get('/manage/proctor?pageSize=50').set('Accept', 'application/json').expect(200);
            assert.match(authorization.body.url, /\/user\/sudo$/);
            await agent.post(authorization.body.url).send({ password: Root.password }).expect(302);
            const settings = await agent.get('/manage/proctor?pageSize=50').set('Accept', 'application/json').expect(200);
            assert.equal(settings.body.pageSize, 50);
            assert.ok(Array.isArray(settings.body.logs));
            assert.equal(settings.body.devices, undefined);
            assert.equal(settings.body.keys?.signingPrivateKey, undefined);
            assert.equal(settings.body.keys?.encryptionPrivateKey, undefined);
            assert.equal(settings.headers['cache-control'], 'no-store');
            await agent.get('/manage/proctor/logs?pageSize=500').set('Accept', 'application/json').expect(403);
            await agent.post(route).set('Accept', 'application/json').send({ operation: 'challenge', version: 'wrong' }).expect(403);
            await agent.get(`/d/system/contest/${tid}/proctor`).set('Accept', 'application/json').expect(404);
            const denied = await supertest.agent(require('hydrooj').httpServer).get('/manage/proctor/logs').set('Accept',
                'application/json').expect(200);
            assert.match(denied.body.url, /\/login\?/);
            assert.equal(denied.body.logs, undefined);
        } finally {
            await contest.del(domainId, tid);
            await domain.del(domainId);
        }
    });

    it('Team registration names the conflicting member and identity; domain team names stay unique across all editors', async () => {
        const { contest, domain, user } = global.Hydro.model;
        const { PRIV } = require('../packages/hydrooj/src/model/builtin');
        const rateCounters = require('../packages/hydrooj/src/service/db').default.collection('opcount');
        // 集成用例共用回环地址，隔离全局计数，避免其他用例的请求耗尽本用例的限额。
        await rateCounters.deleteMany({ op: 'global' });
        const domainId = 'team-conflict-details';
        const otherDomain = 'team-name-other';
        await domain.add(domainId, 2, 'Team conflicts', '');
        await domain.add(otherDomain, 2, 'Other team names', '');
        const members = await Promise.all(['A', 'B', 'C'].map((name) => user.create(`conflict-${name}@example.com`,
            `conflict-${name}`, 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT)));
        await Promise.all(members.map((uid) => domain.setJoin(domainId, uid, true)));
        const clients = await Promise.all(['A', 'B', 'C'].map(async (name) => {
            const client = supertest.agent(require('hydrooj').httpServer);
            await client.post('/login').send({ uname: `conflict-${name}`, password: 'secret' }).expect(302);
            return client;
        }));
        const [a, b, c] = clients;
        const teams = `/d/${domainId}/contest/team`;
        const now = Date.now();
        const t1 = await contest.add(domainId, 'Team conflict', '', 2, 'acm', new Date(now + 60000),
            new Date(now + 3600000), [], false, { allowTeam: true });
        const t2 = await contest.add(domainId, 'Individual conflict', '', 2, 'acm', new Date(now + 60000),
            new Date(now + 3600000), [], false, { allowTeam: true });
        try {
            await a.post(teams).send({ operation: 'create', name: 'D' }).expect(302);
            await a.post(teams).send({ operation: 'create', name: 'E' }).expect(302);
            const mine = getPageArgs(await a.get(teams).set('Accept', 'application/json').expect(200)).mine;
            const d = mine.find((team) => team.displayName === 'D');
            const e = mine.find((team) => team.displayName === 'E');
            await b.post(teams).send({ operation: 'join', code: d.invitationCode }).expect(302);
            await c.post(teams).send({ operation: 'join', code: e.invitationCode }).expect(302);
            await b.post(`/d/${domainId}/contest/${t1}`).send({ operation: 'attend', vuid: d._id }).expect(302);
            const member = await user.getById(domainId, members[0]);
            const memberName = member.displayName || member.uname;
            const conflict = await c.post(`/d/${domainId}/contest/${t1}`).set('Accept', 'application/json')
                .send({ operation: 'attend', vuid: e._id }).expect(403);
            assert.equal(conflict.body.error.name, 'TeamContestMemberConflictError');
            assert.deepEqual(conflict.body.error.params, [memberName, 'D']);
            const adminConflict = await agent.post(`/d/${domainId}/contest/${t1}/user`).set('Accept', 'application/json')
                .send({ operation: 'add_user', uids: [e._id] }).expect(403);
            assert.deepEqual(adminConflict.body.error.params, [memberName, 'D']);
            await a.post(`/d/${domainId}/contest/${t2}`).send({ operation: 'attend' }).expect(302);
            const individual = await b.post(`/d/${domainId}/contest/${t2}`).set('Accept', 'application/json')
                .send({ operation: 'attend', vuid: d._id }).expect(403);
            assert.equal(individual.body.error.name, 'TeamContestIndividualConflictError');
            assert.deepEqual(individual.body.error.params, [memberName]);
            const duplicate = await a.post(teams).set('Accept', 'application/json').send({ operation: 'create', name: ' d ' }).expect(403);
            assert.equal(duplicate.body.error.name, 'TeamNameAlreadyExistsError');
            await a.post(teams).send({ operation: 'rename', vuid: e._id, name: 'D' }).expect(403);
            const adminName = await agent.post(`${teams}/manage`).set('Accept', 'application/json')
                .send({ operation: 'rename', vuid: e._id, name: 'D' }).expect(403);
            assert.equal(adminName.body.error.name, 'TeamNameAlreadyExistsError');
            assert.equal((await user.getTeamById(domainId, e._id)).displayName, 'E');
            await a.post(teams).send({ operation: 'rename', vuid: d._id, name: ' D ' }).expect(302);
            await agent.post(`/d/${otherDomain}/contest/team`).send({ operation: 'create', name: 'D' }).expect(302);
            const concurrent = await Promise.all([
                a.post(teams).send({ operation: 'create', name: 'Concurrent' }),
                agent.post(teams).send({ operation: 'create', name: ' concurrent ' }),
            ]);
            assert.deepEqual(concurrent.map((response) => response.status).sort(), [302, 403]);
            assert.equal(concurrent.find((response) => response.status === 403).body.error?.name
                || getPageArgs(concurrent.find((response) => response.status === 403)).error?.name, 'TeamNameAlreadyExistsError');
        } finally {
            await contest.del(domainId, t1);
            await contest.del(domainId, t2);
            await domain.del(domainId);
            await domain.del(otherDomain);
            await rateCounters.deleteMany({ op: 'global' });
        }
    });

    it('Enabled addons pass management HTTP regressions', () => runAddonHttpTests('runManagementHttpTests', agent));

    it('Solved ranking excludes domain members with zero solved problems', async () => {
        const res = await agent.get('/ranking').expect(200);
        const args = getPageArgs(res);
        assert.equal(args.sort, 'solved');
        assert.deepEqual(args.udocs, []);
        assert.deepEqual(args.solvedCounts, {});
        assert.equal(args.ucount, 0);
        assert.equal(args.upcount, 0);
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
        assert.equal(args.udocs.length, 1);
        assert.equal(args.ucount, 1);
        assert.equal(args.upcount, 1);
        const next = getPageArgs(await agent.get('/ranking?page=2').expect(200));
        assert.deepEqual(next.udocs, []);
        assert.equal(next.ucount, 1);
        assert.equal(next.upcount, 1);
    });

    it('RP ranking still includes positive-RP members with zero solved problems', async () => {
        const { domain } = global.Hydro.model;
        const domainId = 'ranking-rp-zero-solved';
        await domain.add(domainId, 2, 'RP ranking', '');
        try {
            await domain.setUserInDomain(domainId, 2, { join: true, rp: 100 });
            const args = getPageArgs(await agent.get(`/d/${domainId}/ranking?sort=rp`).expect(200));
            assert.equal(args.sort, 'rp');
            assert.deepEqual(args.udocs.map((entry) => entry._id), [2]);
            assert.equal(args.solvedCounts[2], 0);
            assert.equal(args.ucount, 1);
        } finally {
            await domain.del(domainId);
        }
    });

    it('Enabled addons pass contest HTTP regressions', () => runAddonHttpTests('runContestHttpTests', agent));

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
            const navigation = `nav=training&training=${tid}&chapter=7&page=3&sort=desc&redirect=https%3A%2F%2Fevil.example`;
            const submit = await agent.get(`/d/${domainId}/p/${p1}/submit?${navigation}`).expect(302);
            const restored = new URL(submit.headers.location, 'http://localhost');
            assert.equal(restored.pathname, `/d/${domainId}/p/J0001`);
            assert.equal(restored.searchParams.get('nav'), 'training');
            assert.equal(restored.searchParams.get('chapter'), '7');
            assert.equal(restored.searchParams.get('page'), '3');
            assert.equal(restored.searchParams.get('sort'), 'desc');
            assert.equal(restored.searchParams.has('redirect'), false);
            await agent.get(`/training/${tid}/edit?domainId=${domainId}`).set('Accept', 'application/json').expect(403);
        } finally {
            await training.del(domainId, tid);
            await Promise.all([problem.del(domainId, p1), problem.del(domainId, p2)]);
            await domain.del(domainId);
        }
    });

    it('User submission stats count repeated records, survive concurrent increments and refresh cached profiles', async () => {
        const { domain, record, user } = global.Hydro.model;
        const { ObjectId } = require('mongodb');
        const a = 'submission-count-test';
        const b = 'submission-count-other';
        const uid = await user.create('submission-count@example.com', 'submission-count-user', 'secret');
        await domain.add(a, 2, 'Submission count test', '');
        await domain.add(b, 2, 'Other submission count test', '');
        try {
            await domain.setUserInDomain(a, uid, { nSubmit: null, nAccept: null });
            const initialized = await domain.incUserInDomain(a, uid, 'nSubmit');
            assert.equal(initialized.nSubmit, 1, 'legacy null values are incremented atomically from zero');
            assert.equal(typeof initialized.perm, 'bigint', 'the domain-user return shape remains compatible');
            assert.equal((await domain.collUser.findOne({ domainId: a, uid })).perm, undefined, 'derived permissions are not persisted');
            await domain.setUserInDomain(a, uid, { nSubmit: 10 });
            assert.equal((await user.getById(a, uid)).nSubmit, 10);
            const increments = await Promise.all(Array.from({ length: 25 }, () => domain.incUserInDomain(a, uid, 'nSubmit')));
            assert.equal(new Set(increments.map((item) => item.nSubmit)).size, 25);
            assert.equal((await domain.collUser.findOne({ domainId: a, uid })).nSubmit, 35);
            assert.equal((await user.getById(a, uid)).nSubmit, 35, 'increment invalidates the cached user after writing');
            await Promise.all(Array.from({ length: 5 }, () => domain.incUserInDomain(b, uid, 'nSubmit')));
            assert.equal((await user.getById(b, uid)).nSubmit, 5, 'first increments can create a missing domain user');
            await Promise.all(Array.from({ length: 2 }, () => domain.incUserInDomain(a, uid, 'nAccept')));
            assert.equal((await user.getById(a, uid)).nAccept, 2);

            const submission = (domainId: string, pid: number, status = STATUS.STATUS_ACCEPTED, extra = {}) => ({
                _id: new ObjectId(), domainId, pid, uid, status, ...extra,
            });
            await record.coll.insertMany([
                ...Array.from({ length: 5 }, () => submission(a, 1)),
                submission(a, 2), submission(a, 2, STATUS.STATUS_WRONG_ANSWER),
                submission(a, 3, STATUS.STATUS_ACCEPTED, { contest: record.RECORD_PRETEST }),
                submission(a, 4, STATUS.STATUS_ACCEPTED, { contest: record.RECORD_GENERATE }),
                submission(a, 5, STATUS.STATUS_CANCELED),
                submission(b, 1),
            ]);
            await global.Hydro.script.problemStat.run({ udoc: true, pdoc: false }, () => {});
            const cached = await user.getById(a, uid);
            assert.equal(cached.nSubmit, 7, 'five attempts on one problem plus two on another are seven submissions');
            assert.equal(cached.nAccept, 2, 'accepted problems remain deduplicated');
            assert.equal((await user.getById(b, uid)).nSubmit, 1, 'recalculation is domain scoped');
            const { postJudge } = require('../packages/hydrooj/src/handler/judge');
            const acceptedRecord = await record.coll.findOne({ domainId: a, uid, pid: 1, status: STATUS.STATUS_ACCEPTED });
            await postJudge({ ...acceptedRecord, score: 100, time: 0, memory: 0, lang: 'cc', code: '' });
            assert.equal((await user.getById(a, uid)).nAccept, 2, 'a verdict callback does not count an already-rebuilt acceptance again');
            const args = getPageArgs(await agent.get(`/d/${a}/user/${uid}`).set('Accept', 'application/json').expect(200));
            assert.equal(args.stats.nSubmit, 7);
            assert.equal(args.stats.nAccept, 2);
        } finally {
            await record.coll.deleteMany({ domainId: { $in: [a, b] } });
            await domain.del(a);
            await domain.del(b);
        }
    });

    it('Statistics rebuilds defer completed or pending submissions and fence expired writers', async () => {
        const { domain, record, user } = global.Hydro.model;
        const { ObjectId } = require('mongodb');
        const domainId = 'submission-rebuild-race';
        const uid = await user.create('submission-race@example.com', 'submission-race-user', 'secret');
        await domain.add(domainId, 2, 'Rebuild race test', '');
        const users = domain.collUser;
        const originalBulk = users.initializeUnorderedBulkOp;
        const addRecord = () => record.coll.insertOne({ _id: new ObjectId(), domainId, uid, pid: 1, status: STATUS.STATUS_WRONG_ANSWER });
        const rebuild = () => global.Hydro.script.problemStat.run({ udoc: true, pdoc: false }, () => {});
        let finishPending: (() => void) | undefined;
        let pending: Promise<unknown> | undefined;
        try {
            await domain.setUserInDomain(domainId, uid, { nSubmit: 7 });
            await record.coll.insertMany(Array.from({ length: 7 }, () => ({
                _id: new ObjectId(), domainId, uid, pid: 1, status: STATUS.STATUS_WRONG_ANSWER,
            })));
            let intercepted = false;
            users.initializeUnorderedBulkOp = function bulkWithSubmission(...args) {
                const bulk = originalBulk.apply(this, args);
                const execute = bulk.execute.bind(bulk);
                bulk.execute = async (...options) => {
                    if (!intercepted) {
                        intercepted = true;
                        await domain.withUserStatisticsUpdate(domainId, uid, async () => {
                            await addRecord();
                            await domain.incUserInDomain(domainId, uid, 'nSubmit');
                        });
                    }
                    return execute(...options);
                };
                return bulk;
            };
            await rebuild();
            users.initializeUnorderedBulkOp = originalBulk;
            assert.ok(intercepted);
            assert.equal((await users.findOne({ domainId, uid })).nSubmit, 8, 'the old aggregate cannot overwrite a completed increment');

            let started: () => void;
            const ready = new Promise<void>((resolve) => { started = resolve; });
            const finish = new Promise<void>((resolve) => { finishPending = resolve; });
            pending = domain.withUserStatisticsUpdate(domainId, uid, async () => {
                await addRecord();
                started();
                await finish;
                await domain.incUserInDomain(domainId, uid, 'nSubmit');
            });
            await ready;
            await rebuild();
            assert.equal((await users.findOne({ domainId, uid })).nSubmit, 8,
                'a visible record is not counted early while its live increment is pending');
            finishPending();
            await pending;
            assert.equal((await users.findOne({ domainId, uid })).nSubmit, 9);
            assert.equal(await record.coll.countDocuments({ domainId, uid }), 9);

            let leaseStarted: () => void;
            const leaseReady = new Promise<void>((resolve) => { leaseStarted = resolve; });
            const expire = new Promise<void>((resolve) => { finishPending = resolve; });
            pending = domain.withUserStatisticsUpdate(domainId, uid, async () => {
                leaseStarted();
                await expire;
                await domain.incUserInDomain(domainId, uid, 'nSubmit');
            });
            await leaseReady;
            await users.updateOne({ domainId, uid }, { $set: { '_userStatsLock.expiresAt': new Date(0) } });
            await rebuild();
            const rejected = assert.rejects(pending, (error: any) => {
                assert.equal(error.name, 'SystemError');
                assert.match(String(error.params?.[0]), /statistics update expired/i);
                return true;
            });
            finishPending();
            await rejected;
            pending = undefined;
            assert.equal((await users.findOne({ domainId, uid })).nSubmit, 9, 'an expired writer cannot increment a reconciled count');
        } finally {
            users.initializeUnorderedBulkOp = originalBulk;
            finishPending?.();
            await pending?.catch(() => {});
            await record.coll.deleteMany({ domainId });
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
