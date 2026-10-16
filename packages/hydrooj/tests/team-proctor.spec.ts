import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';
import { teamProctorStatus } from '../src/lib/proctor-team.ts';

const require = createRequire(import.meta.url);
const tid = new ObjectId('1234567890abcdef12345678');
const errors = new Proxy({}, { get: (_, name) => class extends Error {
    constructor(...args: unknown[]) { super(`${String(name)}:${args.join(',')}`); }
} });
function evaluate(source: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
    const module = { exports: {} as any };
    const code = transformSync(source, { loader: 'ts', format: 'cjs',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    runInNewContext(code, { module, exports: module.exports, ...globals,
        require: (name: string) => mocks[name] ?? (name.startsWith('../') ? {} : require(name)) });
    return module.exports;
}
function handlers(model: any, teams: Map<number, any>) {
    class Handler {
        user: any = { _id: 7 }; domain = { _id: 'exam' };
        back() {}
        checkPerm() {}
    }
    const permission = evaluate(readFileSync(new URL('../src/lib/team-permissions.ts', import.meta.url), 'utf8'),
        { '../error': errors });
    return evaluate(readFileSync(new URL('../src/handler/contest.ts', import.meta.url), 'utf8'), {
        '../context': { Service: class {} }, '@hydrooj/utils/lib/utils': {}, '../error': errors,
        '../lib/team-permissions': permission,
        '../model/builtin': { PERM: {}, PRIV: {}, STATUS: {} },
        '../service/server': { Handler, param: () => () => {}, post: () => () => {}, Types: new Proxy({}, { get: () => () => [] }) },
        '../model/contest': model,
        '../model/user': { __esModule: true, default: { getTeamById: async (_: string, uid: number) => teams.get(uid) } },
    });
}
function registrations() {
    const statuses: any[] = [];
    const teams = new Map([
        [-101, { _id: -101, displayName: 'D队', captainId: 7, members: [7, 8] }],
        [-102, { _id: -102, displayName: 'E队', captainId: 9, members: [9, 8] }],
    ]);
    const matches = (row: any, query: any): boolean => Object.entries<any>(query).every(([key, value]) => {
        if (key === '$or') return value.some((part: any) => matches(row, part));
        if (value && typeof value === 'object' && !value.toHexString) {
            if ('$ne' in value && row[key] === value.$ne) return false;
            if ('$gt' in value && !(row[key] > value.$gt)) return false;
            if ('$in' in value && !value.$in.some((expected: any) => Array.isArray(row[key])
                ? row[key].includes(expected) : String(row[key]) === String(expected))) return false;
            return true;
        }
        return String(row[key]) === String(value);
    });
    const users = { getTeamById: async (_: string, uid: number) => teams.get(uid),
        getList: async (_: string, members: number[]) => Object.fromEntries(members.map((uid) => [uid,
            { displayName: `成员${uid}`, hasPerm: () => true }])),
        checkTeamContestMembers: null as any };
    const source = readFileSync(new URL('../src/model/user.ts', import.meta.url), 'utf8');
    const check = source.slice(source.indexOf('    static async checkTeamContestMembers('), source.indexOf('    static async renameTeam('))
        .replace('    static async ', 'export async function ');
    users.checkTeamContestMembers = evaluate(check, {}, { UserModel: users,
        db: { collection: () => ({ findOne: async (query: any) => statuses.find((row) => matches(row, query)) }) },
        TeamContestIndividualConflictError: errors.TeamContestIndividualConflictError,
        TeamContestMemberConflictError: errors.TeamContestMemberConflictError, PERM: {},
    }).checkTeamContestMembers;
    let pending = Promise.resolve();
    const sourceContest = readFileSync(new URL('../src/model/contest.ts', import.meta.url), 'utf8');
    const attendSource = sourceContest.slice(sourceContest.indexOf('export async function attend('),
        sourceContest.indexOf('export async function cancelAttend('));
    const model: any = { isDone: () => false, isOngoing: () => true };
    Object.assign(model, evaluate(attendSource, {}, {
        UserModel: users, ValidationError: errors.ValidationError, ContestAlreadyAttendedError: errors.ContestAlreadyAttendedError,
        get: async () => ({ docId: tid, allowTeam: true }),
        getTeamVid: async (_: string, contestId: ObjectId, uid: number) => statuses.find((row) => row.members?.includes(uid))?.uid,
        withTeamMembershipLock: (_: string, action: () => Promise<any>) => {
            const result = pending.then(action);
            pending = result.catch(() => {});
            return result;
        },
        document: { TYPE_CONTEST: 30, inc: async () => {},
            cappedIncStatus: async (domainId: string, docType: number, docId: ObjectId, uid: number,
                field: string, delta: number, min: number, max: number, payload: any) => {
                if (statuses.some((row) => row.uid === uid && row.attend > 0)) throw new Error('重复报名');
                statuses.push({ domainId, docType, docId, uid, attend: 1, ...payload });
            } },
    }));
    return { model, teams, statuses, handlers: handlers(model, teams) };
}

test('自助报名和管理员报名共用底层校验，个人与两支队伍之间均不可重复参赛', async () => {
    const f = registrations();
    const admin = new f.handlers.ContestUserHandler();
    admin.tdoc = { allowTeam: true };
    await admin.postAddUser('exam', tid, [-101]);
    await assert.rejects(admin.postAddUser('exam', tid, [-102]), /TeamContestMemberConflictError:成员8,D队/);
    await assert.rejects(admin.postAddUser('exam', tid, [8]), /ContestAlreadyAttendedError/);
    const self = new f.handlers.ContestDetailHandler();
    self.user._id = 8;
    self.tdoc = { allowTeam: true };
    await assert.rejects(self.postAttend('exam', tid), /ContestAlreadyAttendedError/);
    assert.equal(f.statuses.length, 1);
    const g = registrations();
    await g.model.attend('exam', tid, 8);
    await assert.rejects(g.model.attend('exam', tid, -101), /TeamContestIndividualConflictError:成员8/);
});

test('并发报名只允许一个包含相同成员的参赛身份成功', async () => {
    const f = registrations();
    const results = await Promise.allSettled([f.model.attend('exam', tid, -101), f.model.attend('exam', tid, -102)]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(f.statuses.length, 1);
});

test('普通队员不能提前结束全队比赛，队长可结束但不改变任何个人监考日志状态', async () => {
    const f = registrations();
    const writes: any[] = [];
    f.model.setStatus = async (...args: any[]) => writes.push(args);
    const handler = new (handlers(f.model, f.teams).ContestDetailHandler)();
    handler.team = -101;
    handler.tdoc = { rule: 'acm' };
    handler.tsdoc = { attend: 1 };
    handler.user._id = 8;
    await assert.rejects(handler.postEarlyEnd('exam', tid), /TeamCaptainRequiredError/);
    assert.equal(writes.length, 0);
    handler.user._id = 7;
    await handler.postEarlyEnd('exam', tid);
    assert.equal(writes[0][2], -101);
    assert.ok(Number.isFinite(+writes[0][3].endAt));
    assert.deepEqual(Object.keys(writes[0][3]).sort(), ['endAt', 'startAt']);
});

test('全队日志进度按当前成员逐人计算，未参加监考与缺失状态均算待上传', () => {
    const status = { members: [7, 8, 9], proctorMembers: {
        7: { proctorLogUploaded: true }, 8: { proctorLogUploaded: true }, 10: { proctorLogUploaded: true },
    } };
    const result = teamProctorStatus(status, { 9: { uname: 'zhangsan', displayName: '张三' } });
    assert.equal(result.uploaded, 2);
    assert.equal(result.total, 3);
    assert.deepEqual(result.pending, [{ uid: 9, name: '张三' }]);
    assert.equal(teamProctorStatus({ ...status, members: [7, 8] }).pending.length, 0);
    assert.equal(teamProctorStatus({ members: [7, 8, 9] }).uploaded, 0);
});
