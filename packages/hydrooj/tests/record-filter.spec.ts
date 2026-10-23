import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const transform = (path: string) => transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'),
    { loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
const resolverCode = transform('../src/lib/record-filter.ts');
const handlerCode = transform('../src/handler/record.ts');
const plain = (value: any) => JSON.parse(JSON.stringify(value));

function fixture(options: any = {}) {
    const calls: any[] = [];
    const account = { _id: 7, uname: options.username || '202610100123', displayName: 'Student' };
    const user = {
        getById: async (domainId: string, uid: number) => {
            calls.push(['uid', domainId, uid]);
            return uid === account._id ? account : null;
        },
        getByUname: async (domainId: string, value: string) => {
            calls.push(['username', domainId, value]);
            return value.toLowerCase() === account.uname.toLowerCase() ? account : null;
        },
        getByEmail: async (domainId: string, value: string) => {
            calls.push(['email', domainId, value]);
            return value === 'student@example.com' ? account : null;
        },
        getFuzzyIds: async (domainId: string, value: string) => {
            calls.push(['fuzzy', domainId, value]);
            return account.uname.includes(value) || value === account.displayName ? [account._id] : [];
        },
        getList: async () => ({ 7: account }),
    };
    const resolver = { exports: {} as any };
    runInNewContext(resolverCode, { module: resolver, exports: resolver.exports,
        require: () => ({ __esModule: true, default: user }) });
    class Handler {
        response: any = {};
        args: any = { domainId: options.domainId || 'team' };
        user = { _id: 1, hasPerm: () => true, hasPriv: () => false, own: () => true };

        checkPerm(permission: any) {
            calls.push(['permission', permission]);
            if (options.denied) throw new Error('denied');
        }

        checkPriv() { throw new Error('denied'); }
        async paginate() { return [[{ _id: 'record', uid: 7, pid: 1 }], 1, 1]; }
    }
    const cursor = { sort: () => cursor, project: () => cursor };
    const mocks: any = {
        '../lib/record-filter': resolver.exports,
        '../model/user': { __esModule: true, default: user },
        '../model/builtin': { PERM: { PERM_VIEW_RECORD: 'view-record' }, PRIV: {}, STATUS: {} },
        '../model/record': { __esModule: true, default: { PROJECTION_LIST: [], getMulti: (domainId: string, query: any) => {
            calls.push(['query', domainId, query]);
            return cursor;
        } } },
        '../model/problem': { __esModule: true, default: { PROJECTION_LIST: [], PROJECTION_CONTEST_LIST: [], getList: async () => ({}) } },
        '../model/contest': { get: async () => ({ docId: 'contest', pids: [1] }), getStatus: async () => ({ attend: true }),
            isNotStarted: () => false,
            canShowScoreboard: () => !options.hidden, canShowSelfRecord: () => true, canShowRecord: () => !options.hidden },
        '../service/server': { ConnectionHandler: Handler, param: () => () => {}, subscribe: () => () => {}, Types: {} },
        '../utils': { buildProjection: () => ({}) },
        '../error': { PermissionError: Error },
        './contest': { ContestDetailBaseHandler: Handler },
    };
    const handlers = { exports: {} as any };
    runInNewContext(handlerCode, { module: handlers, exports: handlers.exports,
        require: (name: string) => mocks[name] || (name.startsWith('.') ? {} : require(name)) });
    return { calls, account, resolve: resolver.exports.resolveRecordUserIds, ...handlers.exports };
}

test('numeric usernames fall back from missing UID to username, including numbers too large for a safe UID', async () => {
    for (const username of ['202610100123', '9007199254740993', '000123']) {
        const f = fixture({ username });
        // eslint-disable-next-line no-await-in-loop
        assert.deepEqual(plain(await f.resolve('exam', ` ${username} `)), [7]);
        assert.ok(f.calls.some(([type, domainId, value]) => type === 'username' && domainId === 'exam' && value === username));
        if (username === '9007199254740993') assert.ok(!f.calls.some(([type]) => type === 'uid'));
    }
});

test('existing UID, ordinary username, numeric substring, display name and email filtering remain supported', async () => {
    assert.deepEqual(plain(await fixture().resolve('team', '7')), [7]);
    assert.deepEqual(plain(await fixture({ username: 'Alice' }).resolve('team', 'ALICE')), [7]);
    assert.deepEqual(plain(await fixture().resolve('team', '202610')), [7]);
    assert.deepEqual(plain(await fixture().resolve('team', 'Student')), [7]);
    assert.deepEqual(plain(await fixture().resolve('team', 'student@example.com')), [7]);
    assert.deepEqual(plain(await fixture().resolve('team', 'no-such-user')), []);
    const empty = fixture();
    assert.deepEqual(plain(await empty.resolve('team', ' ')), []);
    assert.equal(empty.calls.length, 0);
});

test('contest and normal record lists use the same domain-aware filter as the live connection', async () => {
    for (const domainId of ['system', 'exam-domain']) {
        for (const tid of [undefined, new ObjectId()]) {
            const f = fixture({ domainId });
            const handler = new f.RecordListHandler();
            // eslint-disable-next-line no-await-in-loop
            await handler.get(domainId, 1, 50, undefined, tid, f.account.uname);
            const query = f.calls.find(([type]) => type === 'query');
            assert.equal(query[1], domainId);
            assert.deepEqual(plain(query[2].uid), { $in: [7] });
            assert.equal(String(query[2].contest || ''), String(tid || ''));
            assert.equal(handler.response.body.rdocs.length, 1);
            const socket = new f.RecordMainConnectionHandler();
            // eslint-disable-next-line no-await-in-loop
            await socket.prepare(domainId, tid, undefined, f.account.uname);
            assert.deepEqual([...socket.uids], [7]);
            assert.ok(f.calls.filter(([type]) => type === 'username').every(([, id]) => id === domainId));
        }
    }
});

test('username filtering cannot bypass record permissions or hidden contest scoreboards', async () => {
    const denied = fixture({ denied: true });
    await assert.rejects(new denied.RecordListHandler().get('team', 1, 50, undefined, new ObjectId(), denied.account.uname));
    await assert.rejects(new denied.RecordMainConnectionHandler().prepare('team', new ObjectId(), undefined, denied.account.uname));
    const hidden = fixture({ hidden: true });
    await assert.rejects(new hidden.RecordListHandler().get('team', 1, 50, undefined, new ObjectId(), hidden.account.uname));
    await assert.rejects(new hidden.RecordMainConnectionHandler().prepare('team', new ObjectId(), undefined, hidden.account.uname));
});

test('an unknown contest username yields no records rather than silently clearing the user filter', async () => {
    const f = fixture();
    const handler = new f.RecordListHandler();
    await handler.get('team', 1, 50, undefined, new ObjectId(), 'missing-user');
    assert.equal(handler.response.body.rdocs.length, 0);
    assert.equal(handler.response.body.rcount, 0);
    const socket = new f.RecordMainConnectionHandler();
    await socket.prepare('team', new ObjectId(), undefined, 'missing-user');
    assert.equal(socket.uids.size, 0);
});
