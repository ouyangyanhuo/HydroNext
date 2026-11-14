import assert from 'node:assert/strict';
import * as supertest from 'supertest';
import { KEYS, NAMESPACE } from '../config';

export async function runManagementHttpTests(admin: any, { Root }: any) {
    const { SystemModel, UserModel, PRIV, httpServer } = require('hydrooj');
    const keys = [KEYS.enabled, KEYS.clientId, KEYS.clientSecret, KEYS.canRegister, 'server.url'];
    const previous = Object.fromEntries(keys.map((key) => [key, SystemModel.get(key)]));
    const route = '/manage/setting';
    const visitor = supertest.agent(httpServer);
    try {
        await SystemModel.set('server.url', `http://127.0.0.1:${httpServer.address().port}/`);
        await SystemModel.set(KEYS.enabled, false);
        const hidden = await visitor.get('/d/system/login').set('Accept', 'application/json').expect(200);
        assert.ok(!hidden.body.loginMethods.some((method: any) => method.id === 'github'));
        const settings = await admin.get(route).set('Accept', 'application/json').expect(200);
        if (settings.body.url) {
            await admin.get(settings.body.url).set('Accept', 'application/json').expect(200);
            await admin.post(settings.body.url).send({ password: Root.password }).expect(302);
        }
        await admin.post(route).set('Accept', 'application/json')
            .send({ [NAMESPACE]: { enabled: true, clientId: '', clientSecret: '' } }).expect(403);
        assert.equal(SystemModel.get(KEYS.enabled), false);
        const secret = 'github-test-secret-never-echo';
        await admin.post(route).set('Accept', 'application/json')
            .send({ [NAMESPACE]: { enabled: true, clientId: 'github-test-client', clientSecret: secret, canRegister: false } }).expect(200);
        const visible = await visitor.get('/d/system/login').set('Accept', 'application/json').expect(200);
        const method = visible.body.loginMethods.find((entry: any) => entry.id === 'github');
        assert.equal(method.text, 'Login with GitHub');
        assert.match(method.icon, /^data:image\/svg\+xml,/);
        assert.ok(!visible.text.includes(secret));
        const form = await admin.get(route).set('Accept', 'application/json').expect(200);
        assert.ok(!form.text.includes(secret));
        assert.equal(form.body.current[KEYS.clientSecret], '');
        assert.match(form.body.current[KEYS.callbackUrl], /^https?:\/\/.+\/oauth\/github\/callback$/);
        assert.equal(form.body.settings.filter((setting: any) => setting.family === 'setting_github_login').length, 5);
        await admin.post(route).set('Accept', 'application/json')
            .send({ [NAMESPACE]: { enabled: true, clientSecret: '' } }).expect(200);
        assert.equal(SystemModel.get(KEYS.clientSecret), secret);
        const start = await visitor.get('/d/system/oauth/github/login?redirect=%2Fd%2Fsystem%2Fp%3Fpage%3D2').expect(302);
        assert.equal(new URL(start.headers.location).origin, 'https://github.com');
        const state = new URL(start.headers.location).searchParams.get('state');
        await supertest.agent(httpServer).get(`/oauth/github/callback?state=${state}&code=invalid`).expect(403);
        await visitor.get(`/oauth/github/callback?state=${state}&error=access_denied`).expect(403);
        const uid = await UserModel.create('github-settings-guest@example.com', 'github-settings-guest', 'secret',
            undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
        await visitor.post('/login').send({ uname: 'github-settings-guest', password: 'secret' }).expect(302);
        assert.ok(uid > 0);
        await visitor.get(route).set('Accept', 'application/json').expect(403);
        await visitor.post(route).set('Accept', 'application/json').send({ [NAMESPACE]: { enabled: false } }).expect(403);
        assert.equal(SystemModel.get(KEYS.enabled), true);
    } finally {
        for (const key of keys) {
            // eslint-disable-next-line no-await-in-loop
            if (previous[key] === undefined) await SystemModel.del(key);
            // eslint-disable-next-line no-await-in-loop
            else await SystemModel.set(key, previous[key]);
        }
        await admin.post('/login').send({ uname: Root.username, password: Root.password }).expect(302);
    }
}
