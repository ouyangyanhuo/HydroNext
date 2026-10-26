import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const built = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/lib/record-access.ts', import.meta.url))],
    bundle: true, write: false, format: 'cjs', platform: 'node',
    external: ['../error', '../model/builtin', '../model/contest', '../model/problem', './contest-security'],
});

function fixture(options: any = {}) {
    const PERM = Object.fromEntries(['EDIT_CONTEST', 'VIEW_RECORD', 'READ_RECORD_CODE', 'READ_RECORD_CODE_ACCEPT', 'VIEW_PROBLEM_HIDDEN']
        .map((key) => [`PERM_${key}`, key]));
    const user = {
        _id: options.owner ? 1 : 2,
        hasPerm: (permission: string) => (options.permissions || ['VIEW_RECORD']).includes(permission),
        hasPriv: () => !!options.global,
        own: () => !!options.contestOwner,
    };
    const stubs: any = {
        '../error': { PermissionError: Error, ContestNotFoundError: Error, ProctorClientRequiredError: Error },
        '../model/proctor': { authenticateAccess: async (...args: any[]) => {
            options.onAuth?.(args);
            if (options.authFailure) throw new Error('认证已失效');
            return { uid: user._id };
        } },
        './contest-security': { requireContestRecordAccess: async (handler: any, tdoc: any, rdoc: any) => {
            if (!tdoc?.proctorEnabled || Date.now() >= tdoc.endAt.getTime()
                || handler.user.own(tdoc) || handler.user.hasPerm('EDIT_CONTEST')) return undefined;
            const token = handler.request.headers['x-proctor-token'];
            const proof = handler.request.headers['x-proctor-proof'];
            if (!token || !proof) throw new Error('proof required');
            await stubs['../model/proctor'].authenticateAccess({ uid: handler.user._id, domainId: handler.domain._id, tid: tdoc.docId },
                token, proof, 'record_view', handler.context.originalPath, { rid: rdoc._id.toHexString() });
            return { assert: async () => {} };
        } },
        '../model/builtin': { PERM, PRIV: { PRIV_READ_RECORD_CODE: 'global' }, STATUS: { STATUS_ACCEPTED: 1 } },
        '../model/contest': {
            get: async () => (options.deletedContest ? null : { docId: 'contest',
                allowTeam: !!options.teammate, proctorEnabled: !!options.proctor, endAt: new Date(Date.now() + (options.done ? -60000 : 60000)),
                allowViewCode: options.allowViewCode }),
            getStatus: async () => ({ attend: options.attend }),
            canShowRecord: () => !!options.showRecord, canShowSelfRecord: () => !!options.showSelf,
            isDone: () => !!options.done,
            isSameTeam: async () => !!options.teammate,
            isOwnOrTeammateRecord: async () => !!options.teammate,
            getTeamVid: async () => options.teammate ? -1000 : null,
        },
        '../model/problem': {
            PROJECTION_LIST: [], get: async () => ({ docId: 1, hidden: options.hidden }),
            getStatus: async () => ({ status: options.accepted ? 1 : 0 }),
            canViewBy: () => !options.hidden || user.hasPerm('VIEW_PROBLEM_HIDDEN'),
        },
    };
    const module = { exports: {} as any };
    runInNewContext(built.outputFiles[0].text, {
        module, exports: module.exports, require: (name: string) => stubs[name] || require(name),
    });
    const record = { _id: new ObjectId('abcdef1234567890abcdef12'), uid: 1, domainId: 'team', pid: 1, contest: options.contest };
    return () => module.exports.getRecordAccess({ user, domain: { _id: 'team' },
        response: { addHeader: () => {} }, context: { originalPath: options.path || '/d/team/record/abcdef1234567890abcdef12' },
        request: { headers: options.proof ? { 'x-proctor-token': 'token', 'x-proctor-proof': 'proof' } : {} } }, record);
}

test('code privileges, accepted status and ownership cannot bypass hidden problem visibility', async () => {
    await Promise.all([
        { permissions: ['VIEW_RECORD', 'READ_RECORD_CODE'] }, { global: true },
        { permissions: ['VIEW_RECORD', 'READ_RECORD_CODE_ACCEPT'], accepted: true }, { owner: true },
    ].map((extra) => assert.rejects(fixture({ hidden: true, ...extra })(), /VIEW_PROBLEM_HIDDEN/)));
});

test('visible problems preserve owner, domain, global and accepted-code permissions', async () => {
    await Promise.all([
        { permissions: ['VIEW_RECORD', 'READ_RECORD_CODE'] }, { global: true },
        { permissions: ['VIEW_RECORD', 'READ_RECORD_CODE_ACCEPT'], accepted: true }, { owner: true },
        { hidden: true, permissions: ['VIEW_RECORD', 'VIEW_PROBLEM_HIDDEN', 'READ_RECORD_CODE'] },
    ].map(async (extra) => assert.equal((await fixture(extra)()).canViewCode, true)));
    assert.equal((await fixture()()).canViewCode, false);
    assert.equal((await fixture({ permissions: ['VIEW_RECORD', 'READ_RECORD_CODE_ACCEPT'] })()).canViewCode, false);
});

test('contest restrictions remain mandatory and participants retain allowed hidden-problem access', async () => {
    await assert.rejects(fixture({ contest: 'contest', global: true })());
    await assert.rejects(fixture({ contest: 'contest', hidden: true, showRecord: true, global: true })(), /VIEW_PROBLEM_HIDDEN/);
    assert.equal((await fixture({ contest: 'contest', hidden: true, showRecord: true, attend: true, global: true })()).canViewCode, true);
    assert.equal((await fixture({ contest: 'contest', showRecord: true, attend: true, done: true, allowViewCode: true })()).canViewCode, true);
    const own = await fixture({ owner: true, contest: 'contest', hidden: true, attend: true })();
    assert.equal(own.canViewDetail, false);
    assert.equal(own.canViewCode, true);
});

test('nonowners still need record visibility and cannot read another users pretest', async () => {
    await assert.rejects(fixture({ permissions: [], global: true })(), /VIEW_RECORD/);
    await assert.rejects(fixture({ contest: `${'0'.repeat(23)}1`, global: true })(), /READ_RECORD_CODE/);
    await assert.rejects(fixture({ contest: 'contest', deletedContest: true })());
});

test('teammates share record and replay code access without bypassing contest visibility', async () => {
    const access = await fixture({ teammate: true, contest: 'contest', attend: true, showSelf: true, permissions: [] })();
    assert.equal(access.canViewCode, true);
    assert.equal(access.canViewDetail, true);
    await assert.rejects(fixture({ teammate: true, contest: 'contest', hidden: true, permissions: [] })(), /VIEW_PROBLEM_HIDDEN/);
    await assert.rejects(fixture({ teammate: true, contest: `${'0'.repeat(23)}1`, permissions: [] })(), /VIEW_RECORD/);
    await assert.rejects(fixture({ contest: 'other-contest', permissions: [] })(), /VIEW_RECORD/);
});

test('监考比赛的本人和队友记录、下载与回放必须有绑定当前用户和记录的读取证明', async () => {
    const base = { teammate: true, contest: 'contest', attend: true, showSelf: true, permissions: [], proctor: true };
    await assert.rejects(fixture(base)());
    await assert.rejects(fixture({ ...base, owner: true })());
    await assert.rejects(fixture({ ...base, proof: true, authFailure: true })(), /认证已失效/);
    for (const path of ['/d/team/record/abcdef1234567890abcdef12', '/d/team/record/abcdef1234567890abcdef12/replay',
        '/d/team/record/abcdef1234567890abcdef12/replay/data']) {
        const calls: any[] = [];
        // eslint-disable-next-line no-await-in-loop
        assert.equal((await fixture({ ...base, proof: true, path, onAuth: (args: any[]) => calls.push(args) })()).canViewCode, true);
        assert.equal(calls.length, 1);
        assert.equal(calls[0][0].uid, 2);
        assert.equal(calls[0][0].domainId, 'team');
        assert.equal(calls[0][3], 'record_view');
        assert.equal(calls[0][4], path);
        assert.equal(calls[0][5].rid, 'abcdef1234567890abcdef12');
    }
    assert.equal((await fixture({ ...base, done: true })()).canViewCode, true);
    assert.equal((await fixture({ ...base, contestOwner: true })()).canViewCode, true);
});
