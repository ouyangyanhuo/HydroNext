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
    const base = PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM | PERM.PERM_VIEW_RECORD | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST;
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
    const snapshot = async (recordId = contestRid) => {
        const WebSocket = require('ws');
        let socket;
        try {
            return await new Promise<any>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('record snapshot timed out')), 5000);
                const url = `ws://127.0.0.1:${httpServer.address().port}/d/${domainId}/record-detail-conn?rid=${recordId}&noTemplate=true`;
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
    await record.coll.updateOne({ _id: contestRid }, { $set: { files: {} } });
    for (const contestOwner of [2, viewer]) {
        // Accepted status does not grant access; the actual creator has a contest-scoped exception.
        const permitted = contestOwner === viewer;
        // eslint-disable-next-line no-await-in-loop
        await contest.edit(domainId, tid, { owner: contestOwner });
        // eslint-disable-next-line no-await-in-loop
        const response = await agent.get(detailUrl).set('Accept', 'application/json').set('x-hydro-inject', 'uicontext').expect(200);
        assert.equal(response.body.canViewCode, permitted);
        assert.equal(response.body.rdoc.code, permitted ? secret : '');
        assert.equal(Boolean(response.body.rdoc.replay), permitted);
        assert.equal(response.body.UiContext.codeReplayUrl, permitted ? replayUrl : undefined);
        // eslint-disable-next-line no-await-in-loop
        assert.equal((await snapshot()).code, permitted ? secret : '');
        // eslint-disable-next-line no-await-in-loop
        const entries = await agent.get(filteredUrl).set('Accept', 'application/json').expect(200);
        assert.equal(entries.body.rdocs.find((doc: any) => doc._id === String(contestRid)).codeReplayUrl, permitted ? replayUrl : undefined);
        // eslint-disable-next-line no-await-in-loop
        await agent.get(`${detailUrl}?download=true`).expect(permitted ? 200 : 403);
        // eslint-disable-next-line no-await-in-loop
        await agent.get(replayUrl).set('Accept', 'application/json').expect(permitted ? 200 : 403);
        // eslint-disable-next-line no-await-in-loop
        await agent.get(`${replayUrl}/data`).set('Accept', 'application/json').expect(permitted ? 200 : 403);
        // eslint-disable-next-line no-await-in-loop
        await agent.get(`/d/${domainId}/contest/${tid}/code`).expect(permitted ? 200 : 403);
    }
    const practice = await agent.get(`/d/${domainId}/record/${rid}?tid=${tid}`).set('Accept', 'application/json').expect(200);
    assert.equal(practice.body.canViewCode, false, 'A contest creator cannot read another user\'s practice source by injecting tid');
    await agent.get(expected).set('Accept', 'application/json').expect(403);
    const otherTid = await contest.add(domainId, 'Other contest', '', 2, 'acm',
        new Date(Date.now() - 3600_000), new Date(Date.now() - 60_000), [pid], false, { allowTeam: true });
    const otherRid = await record.add(domainId, pid, owner, 'cc', secret, false, { contest: otherTid });
    const otherPath = `/d/${domainId}/record/${otherRid}?tid=${tid}`;
    assert.equal((await agent.get(otherPath).set('Accept', 'application/json').expect(200)).body.canViewCode, false);
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

    // Team sharing is scoped to the registration in the record's actual contest, not the team's practice/other-contest code.
    await domain.setUserRole(domainId, viewer, 'default');
    const teamTid = await contest.add(domainId, 'Team replay permissions', '', 2, 'acm',
        new Date(Date.now() - 3600_000), new Date(Date.now() - 60_000), [pid], false, { allowTeam: true });
    const teamVid = await user.createVuser(`team:${owner}:replay-permission`, {
        domainId, captainId: owner, displayName: 'Replay team', members: [owner, viewer],
    });
    await contest.attend(domainId, teamTid, teamVid);
    const teamRid = await record.add(domainId, pid, owner, 'cc', secret, false, { contest: teamTid, contestUid: teamVid });
    const teamSession = 'replay_team_scoped_permission_test';
    await replay.append(owner, domainId, teamSession, { pid, tid: teamTid, initialCode: '', finalCode: secret });
    await replay.bind(owner, domainId, teamSession, teamRid, pid, 'cc', secret, teamTid);
    const teamPath = `/d/${domainId}/record/${teamRid}`;
    const teammate = await agent.get(teamPath).set('Accept', 'application/json').set('x-hydro-inject', 'uicontext').expect(200);
    assert.equal(teammate.body.rdoc.code, secret);
    assert.equal(teammate.body.UiContext.codeReplayUrl, `${teamPath}/replay`);
    assert.equal((await snapshot(teamRid)).code, secret);
    await agent.get(`${teamPath}?download=true`).expect(200);
    await agent.get(`${teamPath}/replay`).set('Accept', 'application/json').expect(200);
    await agent.get(`${teamPath}/replay/data`).set('Accept', 'application/json').expect(200);
    const teamList = await agent.get(`/d/${domainId}/record?tid=${teamTid}`).set('Accept', 'application/json').expect(200);
    assert.equal(teamList.body.rdocs.find((doc: any) => doc._id === String(teamRid)).codeReplayUrl, `${teamPath}/replay`);
    const teamPractice = await agent.get(`/d/${domainId}/record/${rid}?tid=${teamTid}`).set('Accept', 'application/json').expect(200);
    assert.equal(teamPractice.body.canViewCode, false);
    assert.equal((await agent.get(otherPath).set('Accept', 'application/json').expect(200)).body.canViewCode, false);
    const unrelated = await record.add(domainId, pid, 2, 'cc', 'other participant', false, { contest: teamTid });
    assert.equal((await agent.get(`/d/${domainId}/record/${unrelated}`).set('Accept', 'application/json').expect(200)).body.canViewCode, false);
    await agent.get(`/d/${domainId}/contest/${teamTid}/code`).expect(403);
}
