import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const errors = Object.fromEntries([
    'InvalidJoinInvitationCodeError', 'PermissionError', 'SystemError', 'TeamAlreadyJoinedError', 'TeamMemberLimitError',
    'TeamMembershipRequiredError', 'TeamCaptainRequiredError', 'TeamCaptainLeaveError', 'ValidationError',
].map((name) => [name, class extends Error { constructor(...args: unknown[]) { super(`${name}:${args.join(',')}`); } }]));
function load(path: string, mocks: Record<string, any>) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    runInNewContext(code, {
        module, exports: module.exports,
        require: (id: string) => mocks[id] ?? (id.startsWith('../') ? {} : require(id)),
    });
    return module.exports;
}
const permissions = load('../src/lib/team-permissions.ts', { '../error': errors });
const api = load('../src/lib/team-invitation.ts', {
    '../error': errors, '../model/builtin': { PERM: { PERM_ATTEND_CONTEST: 1 } }, './team-permissions': permissions,
});
const clone = (value: any) => value ? structuredClone(value) : null;

function collection(initial: any[]) {
    const rows = clone(initial).map((row: any) => ({ captainId: row.members?.[0], ...row }));
    const writes: any[] = [];
    const match = (row: any, filter: any) => Object.entries(filter).every(([key, value]: [string, any]) => {
        if (key === 'members') {
            if (typeof value === 'number') return row.members.includes(value);
            if (Array.isArray(value)) return JSON.stringify(value) === JSON.stringify(row.members);
            return (!value.$all || value.$all.every((uid: number) => row.members.includes(uid))) && !row.members.includes(value.$ne);
        }
        if (key === '$expr') {
            assert.equal(JSON.stringify(value.$lt[0]), '{"$size":{"$ifNull":["$members",[]]}}');
            return row.members.length < value.$lt[1];
        }
        if (typeof value === 'object' && value && '$exists' in value) return (row[key] !== undefined) === value.$exists;
        if (typeof value === 'object' && value && '$in' in value) {
            return value.$in.some((item: any) => item == null ? row[key] == null : row[key] === item);
        }
        return value === null ? row[key] == null : row[key] === value;
    });
    return {
        rows, writes,
        async findOne(filter: any) { return clone(rows.find((row) => match(row, filter))); },
        async findOneAndUpdate(filter: any, update: any, options: any) {
            writes.push({ filter, update });
            assert.equal(options.returnDocument, 'after');
            const row = rows.find((item) => match(item, filter));
            if (!row) return null;
            if (Array.isArray(update)) {
                const target = update[0].$set.members.$filter.cond.$ne[1];
                row.members = row.members.filter((uid: number) => uid !== target);
                for (const key of update[1]?.$unset || []) delete row[key];
                return clone(row);
            }
            const code = update.$set?._teamJoinCode;
            if (code && rows.some((other) => other._id !== row._id && other._teamJoinCode === code)) {
                throw Object.assign(new Error('duplicate code'), { code: 11000 });
            }
            Object.assign(row, update.$set);
            if (update.$addToSet?.members && !row.members.includes(update.$addToSet.members)) row.members.push(update.$addToSet.members);
            for (const key of Object.keys(update.$unset || {})) delete row[key];
            return clone(row);
        },
    };
}

test('team codes use cryptographic randomness, eight unambiguous characters and case-insensitive input', () => {
    const generated = Array.from({ length: 100 }, () => api.generateTeamInvitationCode());
    assert.equal(new Set(generated).size, 100);
    for (const code of generated) assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal(api.normalizeTeamInvitationCode('  abcdefgh  '), 'ABCDEFGH');
    for (const code of ['', 'A'.repeat(1000), 'ABCD0000', 'ABCDEFGI', '<script>', 'ABCD EFG']) {
        assert.throws(() => api.normalizeTeamInvitationCode(code), /InvalidJoinInvitationCodeError/);
    }
});

test('legacy teams receive a stable code and retire pending private-message invitations', async () => {
    const store = collection([{ _id: -1000, uname: 'team:2:legacy', captainId: undefined, members: [2], invite: [3] }]);
    const team = await api.ensureTeamInvitationCode(store, -1000, 2, false, () => 'ABCDEFGH');
    assert.equal(team._teamJoinCode, 'ABCDEFGH');
    assert.equal(team.captainId, 2);
    assert.equal(team.invite, undefined);
    const again = await api.ensureTeamInvitationCode(store, -1000, 2);
    assert.equal(again._teamJoinCode, team._teamJoinCode);
    assert.equal(store.writes.length, 1);
});

test('members can read team codes but only the captain may reset them', async () => {
    const store = collection([{ _id: -1000, members: [2, 3], _teamJoinCode: 'ABCDEFGH' }]);
    await assert.rejects(api.ensureTeamInvitationCode(store, -1000, 4), /TeamMembershipRequiredError/);
    await assert.rejects(api.ensureTeamInvitationCode(store, -1000, 4, true), /TeamMembershipRequiredError/);
    assert.equal((await api.ensureTeamInvitationCode(store, -1000, 3))._teamJoinCode, 'ABCDEFGH');
    await assert.rejects(api.ensureTeamInvitationCode(store, -1000, 3, true), /TeamCaptainRequiredError/);
    const updated = await api.ensureTeamInvitationCode(store, -1000, 2, true, () => 'JKLMNPQR');
    assert.equal(updated._teamJoinCode, 'JKLMNPQR');
    assert.deepEqual(updated.members, [2, 3]);
    await assert.rejects(api.joinTeamByInvitationCode(store, 'ABCDEFGH', 4, 5), /InvalidJoinInvitationCodeError/);
});

test('code collisions retry against the unique index and concurrent migration returns one stable code', async () => {
    const store = collection([
        { _id: -1000, members: [2], _teamJoinCode: 'ABCDEFGH' }, { _id: -1001, members: [3] },
    ]);
    let attempt = 0;
    const generated = ['ABCDEFGH', 'JKLMNPQR'];
    const result = await api.ensureTeamInvitationCode(store, -1001, 3, false, () => generated[attempt++]);
    assert.equal(result._teamJoinCode, 'JKLMNPQR');
    const fresh = collection([{ _id: -1000, members: [2] }]);
    const results = await Promise.all([
        api.ensureTeamInvitationCode(fresh, -1000, 2, false, () => 'ABCDEFGH'),
        api.ensureTeamInvitationCode(fresh, -1000, 2, false, () => 'JKLMNPQR'),
    ]);
    assert.equal(results[0]._teamJoinCode, results[1]._teamJoinCode);
});

test('joining rejects invalid identity, unknown codes, duplicates and full teams', async () => {
    const store = collection([{ _id: -1000, members: [2], _teamJoinCode: 'ABCDEFGH' }]);
    await assert.rejects(api.joinTeamByInvitationCode(store, 'ABCDEFGH', 0, 5), /PermissionError/);
    await assert.rejects(api.joinTeamByInvitationCode(store, 'JKLMNPQR', 3, 5), /InvalidJoinInvitationCodeError/);
    await assert.rejects(api.joinTeamByInvitationCode(store, 'ABCDEFGH', 2, 5), /TeamAlreadyJoinedError/);
    await assert.rejects(api.joinTeamByInvitationCode(store, 'ABCDEFGH', 3, 1), /TeamMemberLimitError/);
    await assert.rejects(api.joinTeamByInvitationCode(store, 'ABCDEFGH', 3, 0), /ValidationError/);
    await assert.rejects(api.joinTeamByInvitationCode(store, 'ABCDEFGH', 3, 1.5), /ValidationError/);
    assert.deepEqual(store.rows[0].members, [2]);
});

test('concurrent code joins cannot exceed capacity or add the same account twice', async () => {
    const store = collection([{ _id: -1000, members: [2], _teamJoinCode: 'ABCDEFGH' }]);
    const results = await Promise.allSettled([
        api.joinTeamByInvitationCode(store, 'ABCDEFGH', 3, 2),
        api.joinTeamByInvitationCode(store, 'ABCDEFGH', 4, 2),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(store.rows[0].members.length, 2);
    const duplicate = await Promise.allSettled([
        api.joinTeamByInvitationCode(store, 'ABCDEFGH', 5, 5),
        api.joinTeamByInvitationCode(store, 'ABCDEFGH', 5, 5),
    ]);
    assert.equal(duplicate.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(store.rows[0].members.filter((uid: number) => uid === 5).length, 1);
});

test('private invitation fields are excluded by the shared page serializer', () => {
    const serializer = load('../../../framework/framework/serializer.ts', {}).default;
    const serialized = JSON.stringify({ team: { _id: -1000, _teamJoinCode: 'ABCDEFGH', members: [2] } }, serializer());
    assert.doesNotMatch(serialized, /ABCDEFGH|_teamJoinCode/);
});

async function handlerFixture(uid = 2) {
    const calls: any[] = [];
    const store = collection([{ _id: -1000, domainId: 'team-domain', uname: 'team:2:abc', displayName: 'Team', members: [2], invite: [3] }]);
    const model = {
        getVusersByMember: async (member: number) => store.rows.filter((row) => row.members.includes(member)).map(clone),
        getTeamInvitation: async (id: number, member: number, reset: boolean, domainId: string) =>
            api.ensureTeamInvitationCode(store, id, member, reset, undefined, domainId),
        getList: async (domainId: string, uids: number[]) => { calls.push(['list', domainId, uids]); return {}; },
        getVuserById: async (id: number) => store.findOne({ _id: id }),
        joinTeam: async (code: string, member: number, max: number, domainId: string) =>
            api.joinTeamByInvitationCode(store, code, member, max, domainId),
        updateVuserById: async () => {},
    };
    const module = load('../src/handler/contest.ts', {
        '../context': { Service: class {} }, '../error': errors,
        '../service/server': {
            Handler: class {}, param: () => () => {}, post: () => () => {}, Types: { Range: () => [], ArrayOf: () => [] },
        },
        '@hydrooj/utils/lib/utils': {},
        '../lib/team-permissions': permissions,
        '../model/builtin': { PERM: { PERM_ATTEND_CONTEST: 1 }, PRIV: { PRIV_USER_PROFILE: 4 }, STATUS: {} },
        '../model/user': model, '../model/message': { send: () => assert.fail('team joining must not send private messages') },
    });
    let handlerClass: any;
    await module.apply({
        Route: (name: string, _path: string, value: any) => { if (name === 'contest_team') handlerClass = value; },
        worker: { addHandler() {} }, plugin() {}, inject: async () => {},
    });
    const handler = Reflect.construct(handlerClass, []);
    Object.assign(handler, {
        user: { _id: uid, hasPerm: () => false }, domain: { _id: 'team-domain', owner: 99 }, args: { domainId: 'team-domain' },
        response: {}, ctx: { setting: { get: () => 5 } },
        checkPriv: (priv: number) => { assert.equal(priv, 4); if (!uid) throw new Error('Login required'); },
        limitRate: async (...args: any[]) => { calls.push(['rate', ...args]); }, back: () => calls.push(['back']),
    });
    return { handler, calls, store };
}

test('team page requires a normal account and exposes codes only for that account’s teams', async () => {
    const guest = await handlerFixture(0);
    await assert.rejects(guest.handler.prepare(), /Login required/);
    const f = await handlerFixture();
    await f.handler.prepare();
    await f.handler.get({ domainId: 'team-domain' });
    assert.equal(f.handler.response.body.mine.length, 1);
    assert.match(f.handler.response.body.mine[0].invitationCode, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal(f.handler.response.body.invites, undefined);
    assert.equal(f.handler.response.body.mine[0]._teamJoinCode, undefined);
    const outsider = await handlerFixture(3);
    await outsider.handler.get({ domainId: 'team-domain' });
    assert.equal(outsider.handler.response.body.mine.length, 0);
    // A previously removed creator must not promote the remaining member or break their teams page.
    outsider.store.rows[0].members = [3];
    delete outsider.store.rows[0].captainId;
    await outsider.handler.get({ domainId: 'team-domain' });
    const orphaned = outsider.handler.response.body.mine[0];
    assert.equal(orphaned.captainId, 2);
    assert.equal(orphaned.canManage, false);
    assert.equal(orphaned.canLeave, true);
    assert.equal(orphaned.invitationCode, undefined);
    await assert.rejects(permissions.renameTeamByCaptain(outsider.store, -1000, 3, 'Takeover', 'team-domain'), /TeamCaptainRequiredError/);
});

test('legacy invitation operations are removed and code joins are rate-limited per account', async () => {
    const f = await handlerFixture(3);
    for (const name of ['postInvite', 'postAccept', 'postReject']) assert.equal(f.handler[name], undefined);
    f.store.rows[0]._teamJoinCode = 'ABCDEFGH';
    await f.handler.postJoin('team-domain', 'abcdefgh');
    assert.deepEqual(f.store.rows[0].members, [2, 3]);
    assert.equal(f.calls[0][1], 'contest_team_join');
    assert.equal(f.calls[0][4], '3');
    await assert.rejects(f.handler.postResetCode('team-domain', -1000), /TeamCaptainRequiredError/);
    f.handler.user._id = 2;
    await f.handler.postResetCode('team-domain', -1000);
    assert.notEqual(f.store.rows[0]._teamJoinCode, 'ABCDEFGH');
});
