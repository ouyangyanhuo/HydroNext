import assert from 'node:assert/strict';
import * as supertest from 'supertest';

export async function runContestHttpTests() {
    const { ContestModel: contest, DocumentModel: document, DomainModel: domain, UserModel: user, ProblemModel: problem, RecordModel: record,
        PRIV, PERM, httpServer } = require('hydrooj');
    const { CodeReplayModel: replay } = require('../index');
    const domainId = 'replay-navigation-permissions';
    const owner = await user.create('replay-owner@example.com', 'replay-owner', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
    const viewer = await user.create('replay-viewer@example.com', 'replay-viewer', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
    await domain.add(domainId, 2, 'Replay permission test', '');
    const base = PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM | PERM.PERM_VIEW_RECORD | PERM.PERM_VIEW_CONTEST;
    await domain.setRoles(domainId, { default: base, reader: base | PERM.PERM_READ_RECORD_CODE,
        accepted: base | PERM.PERM_READ_RECORD_CODE_ACCEPT });
    await domain.setJoin(domainId, owner, true);
    await domain.setUserRole(domainId, viewer, 'reader', true);
    const pid = await problem.add(domainId, 'R1', 'Replay navigation', 'Statement', 2);
    await problem.edit(domainId, pid, { config: 'type: default\n' });
    const rid = await record.add(domainId, pid, owner, 'cc', 'int main(){}', false);
    const missing = await record.add(domainId, pid, owner, 'cc', 'int main(){}', false);
    const sessionId = 'replay_navigation_permission_test';
    await replay.append(owner, domainId, sessionId, { pid, initialCode: '', finalCode: 'int main(){}' });
    await replay.bind(owner, domainId, sessionId, rid, pid, 'cc', 'int main(){}');
    const agent = supertest.agent(httpServer);
    const login = await agent.post('/login').send({ uname: 'replay-viewer', password: 'secret' }).expect(302);
    const expected = `/d/${domainId}/record/${rid}/replay`;
    const list = await agent.get(`/d/${domainId}/record`).set('Accept', 'application/json').expect(200);
    assert.equal(list.body.rdocs.find((doc: any) => doc._id === String(rid)).codeReplayUrl, expected);
    assert.equal(list.body.rdocs.find((doc: any) => doc._id === String(missing)).codeReplayUrl, undefined);
    const detail = await agent.get(`/d/${domainId}/record/${rid}`).set('Accept', 'application/json')
        .set('x-hydro-inject', 'uicontext').expect(200);
    assert.equal(detail.body.UiContext.codeReplayUrl, expected);
    await agent.get(expected).set('Accept', 'application/json').expect(200);
    await domain.setUserRole(domainId, viewer, 'default');
    const restricted = await agent.get(`/d/${domainId}/record`).set('Accept', 'application/json').expect(200);
    assert.ok(restricted.body.rdocs.every((doc: any) => doc.codeReplayUrl === undefined));
    await agent.get(expected).set('Accept', 'application/json').expect(403);

    // Reproduce the reported bypass: an ended contest with allowViewCode enabled and an enrolled viewer.
    const secret = 'PRIVATE_CONTEST_REPLAY_SOURCE_42';
    const tid = await contest.add(domainId, 'Ended code permission regression', '', 2, 'acm',
        new Date(Date.now() - 3600_000), new Date(Date.now() - 60_000), [pid], false, { allowViewCode: true });
    await contest.attend(domainId, tid, viewer);
    const contestRid = await record.add(domainId, pid, owner, 'cc', secret, false, { type: 'judge', contest: tid });
    await record.coll.updateOne({ _id: contestRid }, { $set: { status: 1, compilerTexts: [secret], files: { code: 'private-code-ref' },
        replay: [{ t: 0, code: secret }] } });
    const contestSession = 'replay_contest_code_permission_test';
    await replay.append(owner, domainId, contestSession, { pid, tid, initialCode: '', finalCode: secret });
    await replay.bind(owner, domainId, contestSession, contestRid, pid, 'cc', secret, tid);
    const detailUrl = `/d/${domainId}/record/${contestRid}`;
    const replayUrl = `${detailUrl}/replay`;
    const filteredUrl = `/d/${domainId}/record?tid=${tid}&uidOrName=${owner}`;
    const filtered = await agent.get(filteredUrl).set('Accept', 'application/json').expect(200);
    assert.ok(filtered.body.rdocs.some((doc: any) => doc._id === String(contestRid)));
    assert.ok(filtered.body.rdocs.every((doc: any) => doc.codeReplayUrl === undefined));
    for (const url of [detailUrl, `${detailUrl}?tid=${tid}`]) {
        // eslint-disable-next-line no-await-in-loop
        const response = await agent.get(url).set('Accept', 'application/json').set('x-hydro-inject', 'uicontext').expect(200);
        assert.equal(response.body.canViewCode, false);
        assert.equal(response.body.rdoc.code, '');
        assert.deepEqual(response.body.rdoc.files, {});
        assert.deepEqual(response.body.rdoc.compilerTexts, []);
        assert.equal(response.body.rdoc.replay, undefined);
        assert.equal(response.body.UiContext.codeReplayUrl, undefined);
        assert.ok(!response.text.includes(secret), 'the initial JSON must not contain private source before WebSocket connects');
    }
    const html = await agent.get(detailUrl).set('Accept', 'text/html').expect(200);
    assert.ok(!html.text.includes(secret), 'HTML hydration must never contain the hidden source');
    await agent.get(`${detailUrl}?download=true`).expect(403);
    await agent.get(replayUrl).set('Accept', 'application/json').expect(403);
    await agent.get(`${replayUrl}/data`).set('Accept', 'application/json').expect(403);
    const cookie = login.headers['set-cookie'].map((value: string) => value.split(';')[0]).join('; ');
    const snapshot = async () => {
        const WebSocket = require('ws');
        let socket;
        try {
            return await new Promise<any>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('record snapshot timed out')), 5000);
                const url = `ws://127.0.0.1:${httpServer.address().port}/d/${domainId}/record-detail-conn?rid=${contestRid}&noTemplate=true`;
                socket = new WebSocket(url, { headers: { Cookie: cookie } });
                socket.on('error', (error: Error) => {
                    clearTimeout(timer); reject(error);
                });
                socket.on('message', (data: Buffer) => {
                    if (data.toString() === 'ping') return socket.send('pong');
                    clearTimeout(timer);
                    const payload = JSON.parse(data.toString());
                    if (payload.error) reject(new Error(JSON.stringify(payload.error)));
                    else resolve(payload.rdoc);
                    return undefined;
                });
            });
        } finally { socket?.terminate(); }
    };
    const deniedSnapshot = await snapshot();
    assert.equal(deniedSnapshot.code, '');
    assert.deepEqual(deniedSnapshot.files, {});
    assert.deepEqual(deniedSnapshot.compilerTexts, []);
    assert.equal(deniedSnapshot.replay, undefined);
    await document.setStatus(domainId, document.TYPE_PROBLEM, pid, viewer, { status: 1 });
    await domain.setUserRole(domainId, viewer, 'accepted');
    for (const contestOwner of [2, viewer]) {
        // Accepted-code permission and contest ownership must not add a third code-reading policy.
        // eslint-disable-next-line no-await-in-loop
        await contest.edit(domainId, tid, { owner: contestOwner });
        // eslint-disable-next-line no-await-in-loop
        const response = await agent.get(detailUrl).set('Accept', 'application/json').set('x-hydro-inject', 'uicontext').expect(200);
        assert.equal(response.body.canViewCode, false);
        assert.equal(response.body.rdoc.code, '');
        assert.equal(response.body.rdoc.replay, undefined);
        assert.equal(response.body.UiContext.codeReplayUrl, undefined);
        // eslint-disable-next-line no-await-in-loop
        assert.equal((await snapshot()).code, '');
        // eslint-disable-next-line no-await-in-loop
        const entries = await agent.get(filteredUrl).set('Accept', 'application/json').expect(200);
        assert.ok(entries.body.rdocs.every((doc: any) => doc.codeReplayUrl === undefined));
        // eslint-disable-next-line no-await-in-loop
        await agent.get(`${detailUrl}?download=true`).expect(403);
        // eslint-disable-next-line no-await-in-loop
        await agent.get(replayUrl).set('Accept', 'application/json').expect(403);
        // eslint-disable-next-line no-await-in-loop
        await agent.get(`${replayUrl}/data`).set('Accept', 'application/json').expect(403);
        // eslint-disable-next-line no-await-in-loop
        await agent.get(`/d/${domainId}/contest/${tid}/code`).expect(403);
    }
    await contest.edit(domainId, tid, { owner: 2 });
    await domain.setUserRole(domainId, viewer, 'reader');
    const allowed = await agent.get(detailUrl).set('Accept', 'application/json').set('x-hydro-inject', 'uicontext').expect(200);
    assert.equal(allowed.body.rdoc.code, secret);
    assert.equal(allowed.body.UiContext.codeReplayUrl, replayUrl);
    assert.equal((await snapshot()).code, secret, 'HTTP and WebSocket grant the same explicit code permissions');
    await agent.get(replayUrl).set('Accept', 'application/json').expect(200);
    await agent.get(`${replayUrl}/data`).set('Accept', 'application/json').expect(200);
    await agent.get(`/d/${domainId}/contest/${tid}/code`).expect(200);
    const ownAgent = supertest.agent(httpServer);
    await ownAgent.post('/login').send({ uname: 'replay-owner', password: 'secret' }).expect(302);
    const own = await ownAgent.get(detailUrl).set('Accept', 'application/json').expect(200);
    assert.equal(own.body.rdoc.code, secret, 'submitters keep access to their own source');
    await ownAgent.get(replayUrl).set('Accept', 'application/json').expect(200);
    await ownAgent.get(`${replayUrl}/data`).set('Accept', 'application/json').expect(200);
}
