import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const tid = new ObjectId('1234567890abcdef12345678');
function load(path: string, mocks: Record<string, any>) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    runInNewContext(code, { module, exports: module.exports,
        require: (name: string) => mocks[name] ?? (name.startsWith('../') ? {} : require(name)) });
    return module.exports;
}

function fixture(options: { proof?: boolean, rejected?: boolean, enabled?: boolean, ended?: boolean } = {}) {
    const calls: any[] = [];
    class ClientRequiredError extends Error { constructor() { super('client required'); } }
    class Handler {
        user = { _id: 7, own: () => false, hasPerm: () => false };
        domain = { _id: 'exam' };
        request = { method: 'get', path: '/p/J0002', headers: options.proof
            ? { 'x-proctor-token': 'token', 'x-proctor-proof': 'proof' } : {} };

        context = { originalPath: '/d/exam/p/J0002?tid=ignored' };
        response: any = { body: {}, addHeader: (name: string, value: string) => calls.push(['header', name, value]) };
        tdoc = { docId: tid, domainId: 'exam', proctorEnabled: options.enabled !== false, pids: [1], rule: 'acm',
            endAt: new Date(Date.now() + (options.ended ? -60000 : 60000)) };

        tsdoc = { attend: 1 };
    }
    const decorators = () => () => {};
    const mocks: any = {
        '../error': new Proxy({ ProctorClientRequiredError: ClientRequiredError }, { get: (target: any, key) => target[key] || Error }),
        '../model/proctor': { authenticateAccess: async (...args: any[]) => {
            calls.push(['auth', ...args]);
            if (options.rejected) throw new Error('client mismatch');
        } },
        '../context': { Service: class {} },
        '../service/server': { Handler, param: decorators, post: decorators, query: decorators, route: decorators,
            Types: new Proxy({}, { get: () => () => [] }), Query: () => ({}) },
        '@hydrooj/utils/lib/search': {}, '@hydrooj/utils/lib/utils': {},
        '../lib/list-sort': { LIST_SORT_MODES: [] },
        '../model/record': { STAT_QUERY: {} },
        '../model/builtin': { PERM: {}, PRIV: {}, STATUS: {} },
        '../model/contest': { isNotStarted: () => false, isDone: () => !!options.ended, isOngoing: () => true,
            RULES: { acm: {} }, getMultiClarification: async () => [], setStatus: async () => calls.push('start-timer') },
        '../model/user': { __esModule: true, default: { getList: async () => ({}) } },
        '../model/problem': { __esModule: true, default: {
            get: async () => { calls.push('load-content'); throw new Error('content loader reached'); },
            getList: async () => { calls.push('load-list'); throw new Error('list loader reached'); },
        } },
    };
    const access = load('../src/lib/proctor-access.ts', mocks);
    mocks['../lib/proctor-access'] = access;
    const contest = load('../src/handler/contest.ts', mocks);
    mocks['./contest'] = { ContestDetailBaseHandler: Handler };
    const problem = load('../src/handler/problem.ts', mocks);
    return { access, contest, problem, Handler, calls };
}

test('ordinary browsers and rejected clients cannot load contest problem content, JSON, pjax or attachments', async () => {
    for (const options of [{}, { proof: true, rejected: true }]) {
        const f = fixture(options);
        const handler = new f.problem.ProblemDetailHandler();
        handler.request.json = true;
        handler.args = { pjax: true, noTemplate: true };
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(handler._prepare('exam', 'J0002', tid), /client/);
        const file = new f.problem.ProblemFileDownloadHandler();
        file.context.originalPath = '/d/exam/p/J0002/file/statement.pdf';
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(file._prepare('exam', 'J0002', tid), /client/);
        assert.ok(!f.calls.includes('load-content'));
        assert.ok(!f.calls.includes('start-timer'));
        assert.equal(handler.response.body.pdoc, undefined);
    }
});

test('successful problem read authenticates the current UID/domain/contest, display PID and full original path before loading', async () => {
    const f = fixture({ proof: true });
    const handler = new f.problem.ProblemDetailHandler();
    await assert.rejects(handler._prepare('exam', 'J0002', tid), /content loader reached/);
    const auth = f.calls.find((call) => call[0] === 'auth');
    assert.equal(auth[1].uid, 7);
    assert.equal(auth[1].domainId, 'exam');
    assert.equal(auth[1].tid, tid);
    assert.equal(auth[4], 'problem_view');
    assert.equal(auth[5], '/d/exam/p/J0002');
    assert.equal(auth[6].pid, 'J0002');
    assert.equal(auth[6].tid, String(tid));
    assert.ok(f.calls.indexOf(auth) < f.calls.indexOf('load-content'));
});

test('contest list, printing and private downloads refuse unauthenticated reads before exposing data or starting a timer', async () => {
    const f = fixture();
    const create = (Class: any) => Object.assign(new Class(), new f.Handler());
    await assert.rejects(create(f.contest.ContestProblemListHandler).get('exam', tid), /client required/);
    await assert.rejects(create(f.contest.ContestPrintHandler).get(), /client required/);
    await assert.rejects(create(f.contest.ContestFileDownloadHandler).get('exam', tid, 'statement.pdf'), /client required/);
    assert.ok(!f.calls.includes('load-list'));
    assert.ok(!f.calls.includes('start-timer'));
    const valid = fixture({ proof: true });
    const list = Object.assign(new valid.contest.ContestProblemListHandler(), new valid.Handler());
    list.context.originalPath = `/d/exam/contest/${tid}/problems`;
    await assert.rejects(list.get('exam', tid), /list loader reached/);
    const auth = valid.calls.find((call) => call[0] === 'auth');
    assert.equal(auth[4], 'contest_view');
    assert.equal(auth[6].tid, String(tid));
    const staff = create(f.contest.ContestPrintHandler);
    staff.user.hasPerm = () => true;
    await staff.get();
    assert.equal(staff.response.template, 'contest_print.html');
    assert.ok(!f.calls.some((call) => call[0] === 'auth'));
});

test('ordinary contests, normal problem routes, ended-contest review and signed POST submission flow are unchanged', async () => {
    for (const options of [{ enabled: false }, { ended: true }]) {
        const f = fixture(options);
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(new f.problem.ProblemDetailHandler()._prepare('exam', 'J0002', tid), /content loader reached/);
        assert.ok(!f.calls.some((call) => call[0] === 'auth'));
    }
    const f = fixture();
    const normal = new f.problem.ProblemDetailHandler();
    await assert.rejects(normal._prepare('exam', 'J0002'), /content loader reached/);
    normal.request.method = 'post';
    await assert.rejects(normal._prepare('exam', 'J0002', tid), /content loader reached/);
    assert.ok(!f.calls.some((call) => call[0] === 'auth'));
});
