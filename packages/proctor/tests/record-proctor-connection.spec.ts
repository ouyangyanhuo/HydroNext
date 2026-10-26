import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { resolveProctorMock } from './mock-api';

const require = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, any>) {
    const module = { exports: {} as any };
    runInNewContext(transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code, {
        module, exports: module.exports, setTimeout: () => 0, clearTimeout: () => {},
        require: (id: string) => resolveProctorMock(id, mocks, (name) => name.startsWith('../') || name.startsWith('./') ? {} : require(name)),
    });
    return module.exports;
}
function fixture(options: { pretest?: boolean, hidden?: boolean, owner?: boolean, attend?: boolean, wrongProblem?: boolean } = {}) {
    const rid = new ObjectId();
    const tid = new ObjectId();
    const rdoc = { _id: rid, uid: options.owner ? 7 : 8, domainId: 'exam', pid: 1,
        contest: options.pretest ? new ObjectId('000000000000000000000000') : tid,
        pretestContest: options.pretest ? tid : undefined, status: 1, code: 'secret', compilerTexts: ['private'] };
    const tdoc = { docId: tid, pids: [options.wrongProblem ? 2 : 1], proctorEnabled: !options.pretest, allowTeam: true,
        endAt: new Date(Date.now() + 60000) };
    const calls: any[] = [];
    let expired = false;
    class Handler {
        conn = {};
        response = { addHeader() { throw new Error('WebSocket 升级后不能再写 HTTP 响应头'); } };
        args = { domainId: 'exam' };
        request: any = { headers: {}, path: '/record-detail-conn' };
        context = { originalPath: '/d/exam/record-detail-conn' };
        domain = { _id: 'exam' };
        user = { _id: 7, own: () => false, hasPerm: () => false, hasPriv: () => false };
        send(data: any) { calls.push(['send', data]); }
        close(...args: any[]) { calls.push(['close', ...args]); }
    }
    const mocks: any = {
        '../error': new Proxy({}, { get: () => Error }),
        '../model/builtin': { PERM: {}, PRIV: {}, STATUS: {} },
        '../model/proctor': { authenticateAccess: async (...args: any[]) => { calls.push(['auth', ...args]); return { _id: 'session' }; },
            assertAccessSession: async () => { if (expired) throw new Error('expired'); } },
        '../service/server': { ConnectionHandler: Handler, param: () => () => {}, subscribe: () => () => {}, Types: {} },
        './contest': { ContestDetailBaseHandler: Handler },
        '../model/contest': { isOwnOrTeammateRecord: async () => true, get: async () => tdoc,
            canShowRecord: () => false, canShowSelfRecord: () => true, getTeamVid: async () => -101,
            getStatus: async () => ({ attend: options.attend === false ? 0 : 1 }), applyProjection: (_: any, doc: any) => doc },
        '../model/record': { __esModule: true, default: { get: async () => rdoc,
            PROJECTION_LIST: ['_id', 'uid', 'pid', 'status', 'contest', 'domainId'],
            RECORD_GENERATE: new ObjectId('000000000000000000000001'), RECORD_PRETEST: new ObjectId('000000000000000000000000') } },
        '../model/problem': { __esModule: true, default: { PROJECTION_LIST: [], get: async () => ({ hidden: options.hidden }),
            getStatus: async () => null, canViewBy: () => !options.hidden } },
        '../model/user': { __esModule: true, default: { getById: async () => ({ _id: 8, uname: 'teammate' }) } },
    };
    mocks['../lib/proctor-record-access'] = load('../lib/proctor-record-access.ts', mocks);
    mocks['./proctor-record-access'] = mocks['../lib/proctor-record-access'];
    mocks['../lib/record-access'] = load('../../hydrooj/src/lib/record-access.ts', mocks);
    return { ...load('../../hydrooj/src/handler/record.ts', mocks), calls, rid, rdoc, expire: () => { expired = true; } };
}

test('ordinary participants receive their own hidden-contest pretest results, never another user’s or an unrelated hidden problem’s', async () => {
    const f = fixture({ pretest: true, hidden: true, owner: true });
    const handler = new f.RecordDetailConnectionHandler();
    await handler.prepare('exam', f.rid, true);
    handler.throttleSend.flush();
    assert.equal(f.calls.find((call) => call[0] === 'send')[1].rdoc.status, 1);
    assert.equal(f.calls.find((call) => call[0] === 'send')[1].rdoc.compilerTexts[0], 'private');
    for (const options of [{ owner: false }, { attend: false }, { wrongProblem: true }]) {
        const denied = fixture({ pretest: true, hidden: true, owner: true, ...options });
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(new denied.RecordDetailConnectionHandler().prepare('exam', denied.rid, true));
        assert.equal(denied.calls.some((call) => call[0] === 'send'), false);
    }
});

test('队友实时记录连接必须先验证个人证明，推送前过期则关闭且不发送代码', async () => {
    const f = fixture();
    await assert.rejects(new f.RecordDetailConnectionHandler().prepare('exam', f.rid, true));
    const handler = new f.RecordDetailConnectionHandler();
    handler.request.headers = { 'x-proctor-token': 'token', 'x-proctor-proof': 'proof' };
    await handler.prepare('exam', f.rid, true);
    assert.equal(f.calls.find((call) => call[0] === 'auth')[4], 'record_view');
    handler.throttleSend.cancel();
    await handler.sendUpdate(f.rdoc);
    f.calls.length = 0;
    f.expire();
    await handler.sendUpdate(f.rdoc);
    assert.equal(f.calls.some((call) => call[0] === 'send'), false);
    assert.equal(f.calls[0][0], 'close');
    assert.equal(f.calls[0][1], 4002);
});

test('记录列表实时广播只发送摘要，不能绕过详情认证读取代码或编译输出', async () => {
    const f = fixture();
    const handler = new f.RecordMainConnectionHandler();
    handler.all = true;
    handler.noTemplate = true;
    const updates: any[] = [];
    handler.queueSend = (_: string, create: () => Promise<any>) => updates.push(create);
    await handler.onRecordChange(f.rdoc);
    const body = await updates[0]();
    assert.equal(body.rdoc.status, 1);
    assert.equal(body.rdoc.code, undefined);
    assert.equal(body.rdoc.compilerTexts, undefined);
    assert.equal(f.rdoc.code, 'secret');
});
