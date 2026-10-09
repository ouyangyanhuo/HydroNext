import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { advanceContestActivity, appendContestActivityTimes, contestActivityBounds } from '../src/lib/contest-activity.ts';

const require = createRequire(import.meta.url);
const tid = new ObjectId('1234567890abcdef12345678');
const tdoc: any = { docId: tid, domainId: 'team', pids: [1, 2], beginAt: new Date(1000), endAt: new Date(100_000) };
const plain = (value: any) => JSON.parse(JSON.stringify(value));

function load(path: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    runInNewContext(code, { module, exports: module.exports, URL, ...globals, require: (name: string) => mocks[name] ?? require(name) });
    return module.exports;
}

test('server time respects flexible starts, early finishes and contest boundaries', () => {
    const bounds = contestActivityBounds({ ...tdoc, duration: 0.01 }, {
        startAt: new Date(10_000), endAt: new Date(40_000),
    } as any);
    assert.deepEqual(bounds, { begin: 10_000, end: 40_000 });
    const advance = advanceContestActivity({ token: 'tab', pid: 1, at: 35_000 }, 'tab', 1, true, 45_000, bounds)!;
    assert.equal(advance.elapsed, 5000);
    assert.equal(advance.activity, null);
    assert.equal(advanceContestActivity(null, 'tab', 1, true, 9000, bounds)!.activity, null);
    const unopened = contestActivityBounds({ ...tdoc, duration: 1 }, {} as any);
    assert.equal(advanceContestActivity(null, 'tab', 1, true, 9000, unopened)!.activity, null);
});

test('tab switches settle once and stale tab closures cannot stop another tab', () => {
    const bounds = { begin: 0, end: 100_000 };
    const changed = advanceContestActivity({ token: 'old', pid: 1, at: 1000 }, 'new', 2, true, 6000, bounds)!;
    assert.equal(changed.countedPid, 1);
    assert.equal(changed.elapsed, 5000);
    assert.equal(changed.activity?.pid, 2);
    assert.equal(advanceContestActivity(changed.activity, 'old', 1, false, 7000, bounds), null);
    const stopped = advanceContestActivity(changed.activity, 'new', 2, false, 9000, bounds)!;
    assert.equal(stopped.elapsed, 3000);
    assert.equal(stopped.activity, null);
});

test('disconnect gaps and backward clocks cannot invent elapsed time', () => {
    const previous = { token: 'tab', pid: 1, at: 1000 };
    const bounds = { begin: 0, end: 100_000 };
    assert.equal(advanceContestActivity(previous, 'tab', 1, true, 50_000, bounds)!.elapsed, 0);
    assert.equal(advanceContestActivity(previous, 'tab', 1, true, 500, bounds)!.elapsed, 0);
});

test('atomic status revisions prevent double counting and persist scoped per-problem totals', async () => {
    let now = 1000;
    let status: any = { domainId: 'team', docId: tid, docType: 30, uid: 3, attend: 1 };
    const statuses = {
        findOne: async (query: any) => {
            if (query.domainId !== status.domainId || query.uid !== status.uid || query.attend !== status.attend
                || String(query.docId) !== String(status.docId)) return null;
            return { ...status };
        },
        findOneAndUpdate: async (query: any, update: any) => {
            const expected = query.problemActivityRev;
            if (expected?.$exists === false ? status.problemActivityRev !== undefined : expected !== status.problemActivityRev) return null;
            status = { ...status, ...plain(update.$set) };
            for (const [path, value] of Object.entries(update.$inc)) {
                if (path.startsWith('problemTimes.')) {
                    status.problemTimes = { ...status.problemTimes };
                    const pid = path.split('.')[1];
                    status.problemTimes[pid] = (status.problemTimes[pid] || 0) + Number(value);
                } else status[path] = (status[path] || 0) + Number(value);
            }
            return { ...status };
        },
    };
    const { heartbeat } = load('../src/model/contest-activity.ts', {
        '../service/db': { __esModule: true, default: { collection: () => statuses } },
        '../error': { ContestNotAttendedError: Error, ValidationError: Error },
        './document': { TYPE_CONTEST: 30 },
        '../lib/contest-activity': { advanceContestActivity, contestActivityBounds },
    }, { Date: { now: () => now } });
    await heartbeat('team', tdoc, 3, 'first', 1, true);
    now = 11_000;
    await Promise.all([heartbeat('team', tdoc, 3, 'first', 1, true), heartbeat('team', tdoc, 3, 'second', 2, true)]);
    assert.equal(status.totalProblemTime, 10_000);
    assert.equal(status.problemTimes[1], 10_000);
    now = 16_000;
    await heartbeat('team', tdoc, 3, 'second', 2, false);
    assert.equal(status.totalProblemTime, 15_000);
    assert.equal(status.problemTimes[2], 5000);
    await assert.rejects(heartbeat('other', tdoc, 3, 'first', 1, true));
    await assert.rejects(heartbeat('team', tdoc, 4, 'first', 1, true));
    await assert.rejects(heartbeat('team', tdoc, 3, 'first', 99, true));
    status.attend = 0;
    await assert.rejects(heartbeat('team', tdoc, 3, 'first', 1, true));
});

test('scoreboard attaches time to the correct user/problem and exports all time columns without changing rank', () => {
    const times = [{ uid: 3, totalProblemTime: 15_000, problemTimes: { 1: 10_000, 2: 5000 } }];
    const rows: any = [
        [
            { type: 'rank', value: '#' }, { type: 'user', value: 'User' },
            { type: 'problem', raw: 1, value: 'A' }, { type: 'problem', raw: 2, value: 'B' },
        ],
        [{ type: 'rank', value: '1' }, { type: 'user', raw: 3, value: 'User' }, { type: 'record', value: '100' }, { type: 'record', value: '0' }],
        [{ type: 'rank', value: '2' }, { type: 'user', raw: 4, value: 'Other' }, { type: 'record', value: '0' }, { type: 'record', value: '0' }],
    ];
    const exported = plain(rows);
    appendContestActivityTimes(rows, times, [1, 2], false, (key) => key);
    assert.equal(rows[1][0].value, '1');
    assert.equal(rows[1][2].value, '00:00:15');
    assert.equal(rows[1][3].problemTime, 10_000);
    assert.equal(rows[1][4].problemTime, 5000);
    assert.equal(rows[2][2].value, '—');
    appendContestActivityTimes(exported, times, [1, 2], true, (key) => key);
    assert.deepEqual(exported[1].slice(-3).map((cell: any) => cell.value), ['00:00:15', '00:00:10', '00:00:05']);
    assert.equal(exported[0].length, exported[1].length);
});

test('activity connection rejects domain overrides and cross-origin connections', async () => {
    const calls: any[] = [];
    const { ContestActivityConnectionHandler } = load('../src/handler/contest-activity.ts', {
        '../service/server': { ConnectionHandler: class {}, param: () => () => {}, Types: {} },
        '../context': {}, '../error': { ForbiddenError: Error, PermissionError: Error },
        '../model/builtin': { PRIV: { PRIV_USER_PROFILE: 1 }, PERM: { PERM_VIEW_CONTEST: 2 } },
        '../model/contest': { get: async () => tdoc },
        '../model/contest-activity': { heartbeat: async (...args: any[]) => { calls.push(args); return {}; } },
    });
    const handler = new ContestActivityConnectionHandler();
    Object.assign(handler, {
        domain: { _id: 'team' }, user: { _id: 3 }, request: { headers: {}, host: 'oj.example' }, context: {},
        checkPriv() {}, checkPerm() {}, send() {}, limitRate() {},
    });
    await assert.rejects(handler.prepare('other', tid, 1));
    handler.request.headers.origin = 'https://evil.example';
    await assert.rejects(handler.prepare('team', tid, 1));
    assert.equal(calls.length, 0);
    handler.request.headers.origin = 'https://oj.example';
    await handler.prepare('team', tid, 1);
    await handler.message({ active: true, uid: 99, pid: 99, domainId: 'other' });
    assert.equal(calls.at(-1)[0], 'team');
    assert.equal(calls.at(-1)[2], 3);
    assert.equal(calls.at(-1)[4], 1);
    assert.equal(calls.at(-1)[5], true);
});
