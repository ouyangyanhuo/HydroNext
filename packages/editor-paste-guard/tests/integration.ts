import assert from 'node:assert/strict';
import * as supertest from 'supertest';
import { PASTE_LIMIT_KEY } from '../config';

export async function runManagementHttpTests(admin: any, { Root }: any) {
    const { SystemModel, httpServer } = require('hydrooj');
    const previous = SystemModel.get(PASTE_LIMIT_KEY);
    const route = '/manage/setting';
    try {
        const settings = await admin.get(route).set('Accept', 'application/json').expect(200);
        if (settings.body.url) {
            await admin.get(settings.body.url).set('Accept', 'application/json').expect(200);
            await admin.post(settings.body.url).send({ password: Root.password }).expect(302);
        }
        const allowed = await admin.get(route).set('Accept', 'application/json').expect(200);
        const pasteSetting = allowed.body.settings.find((setting: any) => setting.key === PASTE_LIMIT_KEY);
        assert.equal(pasteSetting.value, 30);
        assert.equal(pasteSetting.family, 'setting_code_paste');
        const visitor = supertest.agent(httpServer);
        const denied = await visitor.post(route).set('Accept', 'application/json')
            .send({ 'editor-paste-guard': { maxLength: -1 } }).expect(200);
        assert.match(denied.body.url, /\/login\?/);
        for (const limit of [0, -1, 8, 30]) {
            // eslint-disable-next-line no-await-in-loop
            await admin.post(route).set('Accept', 'application/json').send({ 'editor-paste-guard': { maxLength: limit } }).expect(200);
            assert.equal(SystemModel.get(PASTE_LIMIT_KEY), limit);
            // eslint-disable-next-line no-await-in-loop
            const context = await visitor.get('/p').set('Accept', 'application/json').set('x-hydro-inject', 'uicontext').expect(200);
            assert.equal(context.body.UiContext.editorPasteLimit, limit);
        }
        for (const invalid of [-2, 1.5, '', '1e2']) {
            // eslint-disable-next-line no-await-in-loop
            await admin.post(route).set('Accept', 'application/json').send({ 'editor-paste-guard': { maxLength: invalid } }).expect(403);
            assert.equal(SystemModel.get(PASTE_LIMIT_KEY), 30);
        }
    } finally {
        if (previous === undefined) await SystemModel.del(PASTE_LIMIT_KEY);
        else await SystemModel.set(PASTE_LIMIT_KEY, previous);
        // Leave the shared test administrator outside sudo, as before this fixture.
        await admin.post('/login').send({ uname: Root.username, password: Root.password }).expect(302);
    }
}
