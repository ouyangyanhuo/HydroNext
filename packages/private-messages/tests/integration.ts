import assert from 'node:assert/strict';
import * as supertest from 'supertest';

export async function runManagementHttpTests(agent: any, { getPageArgs }: any) {
    const { domain, user, message } = global.Hydro.model;
    const { PRIV } = require('hydrooj');
    const domainId = 'private-message-addon-test';
    const uid = await user.create('private-chat@example.com', 'private-chat', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
    await domain.add(domainId, 2, 'Private messages', '');
    await domain.setUserInDomain(domainId, uid, { join: true, displayName: 'Domain nickname' });
    const visitor = supertest.agent(require('hydrooj').httpServer);
    const route = `/d/${domainId}/home/messages`;
    try {
        const guest = await visitor.get(route).set('Accept', 'application/json').expect(200);
        assert.match(guest.body.url, /\/login\?/);
        const result = await agent.post(route).set('Accept', 'application/json')
            .send({ operation: 'send', uid, content: 'Private message' }).expect(200);
        assert.equal(result.body.udoc.displayName, 'Domain nickname');
        assert.equal(result.body.mdoc.from, 2);
        const messageId = result.body.mdoc._id;
        await visitor.post('/login').send({ uname: 'private-chat', password: 'secret' }).expect(302);
        const inbox = getPageArgs(await visitor.get(route).set('Accept', 'application/json').expect(200));
        assert.ok(inbox.messages[2].messages.some((entry) => entry._id === messageId));
        await visitor.post(route).set('Accept', 'application/json').send({ operation: 'delete_message', messageId }).expect(403);
        await agent.post(route).set('Accept', 'application/json').send({ operation: 'delete_message', messageId }).expect(200);
        const { ObjectId } = require('mongodb');
        assert.equal(await message.get(new ObjectId(messageId)), null);
        await agent.post(route).set('Accept', 'application/json').send({ operation: 'send', uid: -1000, content: 'blocked' }).expect(403);
    } finally {
        await domain.del(domainId);
    }
}
