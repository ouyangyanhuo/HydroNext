import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { Types } from '../../../framework/framework/validator.ts';
import { canonical, digest, submissionPayload } from '../src/lib/proctor.ts';

const require = createRequire(import.meta.url);
function fixture(options: any = {}) {
    const calls: any[] = [];
    class Handler {
        request: any = { headers: { 'x-proctor-token': 'token', 'x-proctor-proof': 'proof' }, files: {} };
        context = { originalPath: '/d/exam/p/J0002/submit' };
        user = { _id: 7 }; tdoc = { proctorEnabled: options.enabled !== false };
        pdoc = { docId: 42, config: { type: 'default' } };
        response: any = { body: { pdoc: this.pdoc } };
        async limitRate() { return undefined; }
        url(name: string) { return name; }
    }
    const decorators = () => () => {};
    const stubs: any = {
        '@hydrooj/utils/lib/search': {},
        '@hydrooj/utils/lib/utils': {},
        '../error': new Proxy({}, { get: () => Error }),
        '../service/server': { Handler, param: decorators, post: decorators, query: decorators, route: decorators,
            Types: new Proxy({}, { get: () => () => [] }), Query: () => ({}) },
        './contest': { ContestDetailBaseHandler: Handler },
        '../lib/proctor': { submissionPayload },
        '../lib/list-sort': { LIST_SORT_MODES: [] },
        '../model/builtin': { PERM: {}, PRIV: {}, STATUS: {} },
        '../model/proctor': {
            authenticate: async (...args: any[]) => {
                calls.push(['authenticate', ...args]);
                if (options.authFailure) throw new Error('unauthorized');
                return {};
            },
            reserveSubmission: async () => {
                calls.push('reserve');
                return Object.assign(async () => calls.push('release'), { assert: async () => {
                    if (options.leaseFailure) throw new Error('submission lease expired');
                } });
            },
        },
        '../model/setting': { langs: { cc: {} } },
        '../model/system': { get: () => 100 },
        '../model/problem': { inc: async () => undefined },
        '../model/domain': { incUserInDomain: async () => undefined, withUserStatisticsUpdate: async (_, __, action) => action() },
        '../model/contest': { canShowSelfRecord: () => true, updateStatus: async () => undefined },
        '../model/record': { STAT_QUERY: {}, add: async (...args: any[]) => {
            calls.push(['add', ...args]);
            if (options.recordFailure) throw new Error('judge queue unavailable');
            return new ObjectId();
        } },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/handler/problem.ts', import.meta.url), 'utf8'),
        { loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    runInNewContext(code, { module, exports: module.exports, Buffer,
        require: (name: string) => stubs[name] ?? (name.startsWith('../') ? {} : require(name)) });
    const handler = new module.exports.ProblemSubmitHandler();
    handler.pdoc = { docId: 42, config: { type: 'default' } };
    handler.response.body.pdoc = handler.pdoc;
    return { handler, calls, HackHandler: module.exports.ProblemHackHandler };
}

test('proctored formal submissions and self-tests require proof before queuing or updating stats', async () => {
    for (const pretest of [false, true]) {
        const f = fixture({ authFailure: true });
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(f.handler.post('exam', 'cc', 'code', pretest, ['input'], new ObjectId()));
        assert.equal(f.calls[0][0], 'authenticate');
        assert.ok(!f.calls.some((call) => call[0] === 'add'));
        assert.ok(!f.calls.includes('reserve'));
    }
});

test('proof includes numeric document PID and original code before normalization; reservations are released', async () => {
    const f = fixture();
    const tid = new ObjectId();
    await f.handler.post('exam', 'cc', 'line\r\n', false, [], tid);
    const auth = f.calls[0];
    assert.equal(auth[1].domainId, 'exam');
    assert.equal(auth[1].tid, tid);
    assert.equal(auth[4], 'submit');
    assert.equal(auth[5], '/d/exam/p/J0002/submit');
    assert.equal(auth[6].pid, 42);
    assert.equal(auth[6].code, 'line\r\n');
    assert.equal(f.calls.find((call) => call[0] === 'add')[5], 'line\n');
    assert.equal(f.calls.at(-1), 'release');
    const g = fixture({ recordFailure: true });
    await assert.rejects(g.handler.post('exam', 'cc', 'code', false, [], tid));
    assert.equal(g.calls.at(-1), 'release');
});

test('self-test input is restored after parameter conversion before proof validation and reaches the judge unchanged', async () => {
    for (const input of [[''], ['1 2\n'], ['', '3\n', '']]) {
        const f = fixture();
        const converted = Types.ArrayOf(Types.String, true)[0](input);
        // eslint-disable-next-line no-await-in-loop
        await f.handler.post('exam', 'cc', 'code', true, converted, new ObjectId());
        const payload = f.calls[0][6];
        assert.equal(digest(canonical(payload)), digest(canonical(submissionPayload(42, 'cc', 'code', true, input))));
        assert.deepEqual(payload.input, input);
        assert.deepEqual(f.calls.find((call) => call[0] === 'add')[7].input, input);
    }
});

test('ordinary contests and non-contest submissions do not acquire monitoring dependencies', async () => {
    const f = fixture({ enabled: false });
    await f.handler.post('exam', 'cc', 'code', false, [], new ObjectId());
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][0], 'add');
    const g = fixture();
    await g.handler.post('exam', 'cc', 'code');
    assert.equal(g.calls.length, 1);
    assert.equal(g.calls[0][0], 'add');
    const selfTest = fixture({ enabled: false });
    const tid = new ObjectId();
    await selfTest.handler.post('exam', 'cc', 'code', true, ['input'], tid);
    const args = selfTest.calls.find((call) => call[0] === 'add')[7];
    assert.equal(args.type, 'pretest');
    assert.equal(args.contest, tid, 'the server retains the authorized contest context for the private result');
});

test('expired submission reservations fail closed and always release the lease', async () => {
    const f = fixture({ leaseFailure: true });
    await assert.rejects(f.handler.post('exam', 'cc', 'code', false, [], new ObjectId()), /lease expired/);
    assert.ok(!f.calls.some((call) => call[0] === 'add'));
    assert.equal(f.calls.at(-1), 'release');
});

test('unsupported hack submissions cannot bypass proctored contest authentication', async () => {
    const f = fixture();
    const handler = new f.HackHandler();
    handler.tdoc = { proctorEnabled: true };
    await assert.rejects(handler.post('exam', 'input', false, new ObjectId()), /unavailable in proctored contests/);
    assert.equal(f.calls.length, 0);
});
