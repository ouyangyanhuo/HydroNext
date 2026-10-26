/* eslint-disable no-await-in-loop, ts/no-loop-func -- Sequential client proofs and sockets exercise each finish mode in isolation. */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import * as supertest from 'supertest';

export async function runProctorSudoHttpTests(_agent: any, { Root }: any) {
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
}

export async function runProctorFlowHttpTests(_agent: any) {
    const { contest, domain, problem, user, record, storage } = global.Hydro.model;
    const { ObjectId } = require('mongodb');
    const { PERM, PRIV } = require('../../hydrooj/src/model/builtin');
    const proctor = require('../model/store');
    const { canonical, digest, secret, signedPayload, verifyPayload } = require('../lib/proctor');
    const { constants, createCipheriv, publicEncrypt, randomBytes } = require('crypto');
    const WebSocket = require('ws');
    const domainId = 'proctor-pretest-finish';
    const rateCounters = require('../../hydrooj/src/service/db').default.collection('opcount');
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
                socket.on('error', (error: Error) => {
                    clearTimeout(timer);
                    reject(error);
                });
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
            const binding = { origin, uid, domainId,
                tid: tid.toHexString(), attemptId: session.payload.attemptId, fingerprint,
                publicKey: device.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
            const encryptJournal = (identity: typeof binding) => {
                const key = randomBytes(32);
                const iv = randomBytes(12);
                const cipher = createCipheriv('aes-256-gcm', key, iv);
                cipher.setAAD(Buffer.from(`HYDRO-PROCTOR-LOG/1:${keys.keyId}`));
                const journalHeader = { protocol: 'hydro-journal/1', binding: identity };
                const ciphertext = Buffer.concat([cipher.update(`${JSON.stringify(journalHeader)}\nFINISH ${tid}\n`), cipher.final()]);
                const header = { keyId: keys.keyId, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'),
                    wrappedKey: publicEncrypt({ key: keys.encryptionPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING,
                        oaepHash: 'sha256' }, key).toString('base64url') };
                key.fill(0);
                return Buffer.concat([Buffer.from(`HYDRO-PROCTOR-LOG/1\n${JSON.stringify(header)}\n`), ciphertext]);
            };
            const filename = `${ending}.hplog`;
            const wrong = encryptJournal({ ...binding, domainId: 'another-domain' });
            await participant.post(route).set(headers('upload', 'POST', route, { filename, size: wrong.length, sha256: digest(wrong) }))
                .set('Origin', `http://127.0.0.1:${require('hydrooj').httpServer.address().port}`)
                .field('operation', 'upload').attach('file', wrong, filename).expect(403);
            assert.notEqual((await contest.getStatus(domainId, tid, uid)).proctorLogUploaded, true);
            assert.equal(await proctor.logs.countDocuments({ attemptId: new ObjectId(binding.attemptId) }), 0);
            const file = encryptJournal(binding);
            await participant.post(route).set(headers('upload', 'POST', route, { filename, size: file.length, sha256: digest(file) }))
                .set('Origin', `http://127.0.0.1:${require('hydrooj').httpServer.address().port}`)
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
}

export async function runProctorTeamHttpTests(agent: any, { getPageArgs, runAddonHttpTests }: any) {
    const { contest, domain, problem, user, record } = global.Hydro.model;
    const { PRIV } = require('../../hydrooj/src/model/builtin');
    const { getRecordAccess } = require('../../hydrooj/src/lib/record-access');
    const proctor = require('../model/store');
    const { canonical, digest, secret, signedPayload } = require('../lib/proctor');
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
}

export async function runProctorApiHttpTests(agent: any, { Root }: any) {
    const { contest, domain } = global.Hydro.model;
    const domainId = 'proctor-route-test';
    await domain.add(domainId, 2, 'Proctor route test', '');
    const now = Date.now();
    const tid = await contest.add(domainId, 'Proctor route test', '', 2, 'acm', new Date(now - 60000),
        new Date(now + 3600000), [], false, { proctorEnabled: true });
    try {
        await contest.attend(domainId, tid, 2);
        const route = `/d/${domainId}/contest/${tid}/proctor`;
        const proctor = require('../model/store');
        const { verifyPayload } = require('../lib/proctor');
        const keys = await proctor.generateKeys();
        const identity = await agent.post(`/d/${domainId}/proctor/identity`).set('Accept', 'application/json')
            .send({ clientNonce: 'n'.repeat(43), tid: tid.toHexString() }).expect(200);
        assert.ok(verifyPayload(identity.body.payload, identity.body.signature, keys.signingPublicKey));
        assert.equal(identity.body.payload.uid, 2);
        const loggedIn = await global.Hydro.model.user.getById(domainId, 2);
        const { PRIV } = require('../../hydrooj/src/model/builtin');
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
}
