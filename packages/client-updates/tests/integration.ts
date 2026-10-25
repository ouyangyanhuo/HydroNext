import assert from 'node:assert/strict';
import * as supertest from 'supertest';

export async function runManagementHttpTests(agent: any) {
    const updates = require('../model');
    const guest = supertest.agent(require('hydrooj').httpServer);
    const denied = await guest.get('/manage/client-updates').set('Accept', 'application/json').expect(200);
    assert.match(denied.body.url, /\/login\?/);
    assert.equal(denied.body.assets, undefined);
    await guest.post('/manage/client-updates').set('Accept', 'application/json')
        .send({ operation: 'delete', id: '0123456789abcdef01234567', revision: 0 }).expect(200)
        .then((response) => assert.match(response.body.url, /\/login\?/));
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
}
