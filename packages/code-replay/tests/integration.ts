import assert from 'node:assert/strict';
import * as supertest from 'supertest';

export async function runContestHttpTests() {
    const { DomainModel: domain, UserModel: user, ProblemModel: problem, RecordModel: record,
        PRIV, PERM, httpServer } = require('hydrooj');
    const { CodeReplayModel: replay } = require('../index');
    const domainId = 'replay-navigation-permissions';
    const owner = await user.create('replay-owner@example.com', 'replay-owner', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
    const viewer = await user.create('replay-viewer@example.com', 'replay-viewer', 'secret', undefined, '127.0.0.1', PRIV.PRIV_DEFAULT);
    await domain.add(domainId, 2, 'Replay permission test', '');
    const base = PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM | PERM.PERM_VIEW_RECORD;
    await domain.setRoles(domainId, { default: base, reader: base | PERM.PERM_READ_RECORD_CODE });
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
    await agent.post('/login').send({ uname: 'replay-viewer', password: 'secret' }).expect(302);
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
}
