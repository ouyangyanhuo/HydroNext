import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const built = buildSync({
    entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
});

// Model-level tests deliberately use an isolated collection double, never the user's database.
function matches(doc: any, query: any): boolean {
    return Object.entries(query).every(([key, value]: [string, any]) => {
        if (key === '$or') return value.some((part: any) => matches(doc, part));
        if (value?.$exists !== undefined) return (doc[key] !== undefined) === value.$exists;
        if (value?.$ne !== undefined) return doc[key] !== value.$ne;
        if (value?.$in) return value.$in.some((item: any) => String(item) === String(doc[key]));
        if (value == null) return doc[key] == null;
        return String(doc[key]) === String(value);
    });
}

class Collection {
    docs = new Map<string, any>();
    async createIndex() { return 'test-index'; }
    async insertOne(doc: any) {
        const id = String(doc._id);
        if (this.docs.has(id)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
        this.docs.set(id, { ...doc });
    }

    async findOne(query: any) {
        const doc = [...this.docs.values()].find((value) => matches(value, query));
        return doc ? { ...doc } : null;
    }

    find(query: any) {
        const docs = [...this.docs.values()].filter((value) => matches(value, query));
        const cursor = { sort: (_sort: any) => cursor, toArray: async () => docs.map((doc) => ({ ...doc })) };
        return cursor;
    }

    async updateOne(query: any, update: any, options: any = {}) {
        let doc = await this.findOne(query);
        if (!doc) {
            if (!options.upsert) return;
            if (this.docs.has(String(query._id))) throw Object.assign(new Error('Duplicate'), { code: 11000 });
            doc = Object.fromEntries(Object.entries(query).filter(([key, value]) => !key.startsWith('$')
                && (value == null || typeof value !== 'object' || value instanceof ObjectId)));
            Object.assign(doc, update.$setOnInsert);
        }
        Object.assign(doc, update.$set);
        for (const key of Object.keys(update.$unset || {})) delete doc[key];
        this.docs.set(String(doc._id), doc);
    }

    async updateMany(query: any, update: any) {
        await Promise.all([...this.docs.values()].filter((doc) => matches(doc, query))
            .map((doc) => this.updateOne({ _id: doc._id }, update)));
    }
}

async function fixture(access = async (_handler: any, _record: any) => ({ canViewCode: true })) {
    const sessions = new Collection();
    const chunks = new Collection();
    const records = new Map<string, any>();
    const hooks = new Map<string, (...args: any[]) => any>();
    const routes = new Map<string, any>();
    const module = { exports: {} as any };
    const hydro = {
        db: { collection: (name: string) => (name === 'code_replay' ? sessions : chunks) },
        RecordModel: { get: async (domain: string, rid: any) => {
            const record = records.get(String(rid));
            return record?.domainId === domain ? record : null;
        } },
        Handler: class {}, ObjectId, Types: {}, PRIV: {}, PERM: {}, STATUS: {},
        getRecordAccess: access, PermissionError: Error,
        ProblemModel: { PROJECTION_LIST: [], get: async () => ({ docId: 1 }) },
        UserModel: { getById: async () => ({ _id: 1 }) },
        ValidationError: Error, param: () => () => {},
    };
    runInNewContext(built.outputFiles[0].text, {
        module, exports: module.exports, global: { Hydro: { model: {} } }, Array,
        require: (name: string) => (name === 'hydrooj' ? hydro : require(name)),
    });
    await module.exports.apply({
        logger: () => ({ warn() {} }), Route: (name: string, _path: string, handler: any) => routes.set(name, handler),
        i18n: { load() {} },
        on: (name: string, handler: any) => hooks.set(name, handler),
    });
    return { model: module.exports.CodeReplayModel, sessions, chunks, records, hooks, routes };
}

const sourceId = 'a'.repeat(48);
const base = { pid: '1', initialCode: '', lang: 'cc' };
const first = { seq: 1, t: 100, changes: [{ rangeOffset: 0, rangeLength: 0, text: 'abc' }] };
const second = { seq: 2, t: 200, changes: [{ rangeOffset: 1, rangeLength: 1, text: 'd' }] };

test('session API preserves action metadata and rejects unsupported or malformed actions', async () => {
    const { model, routes, sessions } = await fixture();
    const handler = new (routes.get('code_replay_session'))();
    const action = { seq: 1, t: 100, changes: [], action: 'self_test', timestamp: 1000, lang: 'cc' };
    Object.assign(handler, {
        user: { _id: 1 }, response: {}, limitRate() {},
        args: { replayVersion: 2, action: 'append', events: [action] },
    });
    await handler.post('team', sourceId, '1', undefined, 'cc', 'abc');
    const checkpoint = await model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'abc', endSeq: 1, endTime: 100 });
    const frozen = await model.getEvents(checkpoint, sessions.docs.get(checkpoint));
    // Inspect the source stream directly as well as its verified checkpoint.
    const data = await model.getEvents(sourceId);
    assert.equal(data.events[0].action, 'self_test');
    assert.equal(data.events[0].timestamp, 1000);
    assert.equal(frozen.events[0].action, 'self_test');
    assert.ok(checkpoint);
    handler.args.events = [{ ...action, seq: 2, action: 'unknown' }];
    await assert.rejects(handler.post('team', sourceId, '1', undefined, 'cc', 'abc'));
    handler.args.events = [{ ...action, seq: 2, changes: [{ rangeOffset: -1, rangeLength: 0, text: 'x' }] }];
    await assert.rejects(handler.post('team', sourceId, '1', undefined, 'cc', 'abc'));
});

test('multiple checkpoints share immutable deltas and retries do not duplicate batches', async () => {
    const { model, chunks, sessions, records } = await fixture();
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [first] });
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [first] });
    assert.equal(chunks.docs.size, 1);
    const checkpoint1 = await model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'abc', endSeq: 1, endTime: 150 });
    const rid = new ObjectId();
    records.set(String(rid), { domainId: 'team', uid: 1, pid: 1, lang: 'cc', code: 'abc' });
    await model.bind(1, 'team', checkpoint1, rid, 1, 'cc', 'abc');
    const old = await model.getByRid(rid);
    assert.equal(old.expiresAt, undefined);
    assert.equal([...chunks.docs.values()][0].expiresAt, undefined);
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [second] });
    const checkpoint2 = await model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'adc', endSeq: 2, endTime: 250 });
    assert.equal((await model.getEvents(checkpoint1, old)).events.length, 1);
    assert.equal((await model.getEvents(checkpoint2, sessions.docs.get(checkpoint2))).events.length, 2);
    assert.equal(chunks.docs.size, 2);
    // Even a subsequently uploaded conflicting event cannot modify frozen history.
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [{ ...first, t: 101 }] });
    assert.equal((await model.getEvents(checkpoint1, old)).events[0].t, 100);
    await assert.rejects(model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'adc', endSeq: 2, endTime: 250 }));
});

test('cross-user/domain/problem access and mismatching record binding are rejected', async () => {
    const { model, records } = await fixture();
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [first] });
    await assert.rejects(model.appendContinuous(2, 'team', sourceId, { ...base, events: [second] }));
    await assert.rejects(model.appendContinuous(1, 'other', sourceId, { ...base, events: [second] }));
    await assert.rejects(model.appendContinuous(1, 'team', sourceId, { ...base, pid: '2', events: [second] }));
    await assert.rejects(model.append(1, 'team', sourceId, { ...base, events: [second] }));
    await assert.rejects(model.checkpoint(2, 'team', sourceId, { ...base, finalCode: 'abc', endSeq: 1, endTime: 150 }));
    const checkpoint = await model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'abc', endSeq: 1, endTime: 150 });
    const rid = new ObjectId();
    records.set(String(rid), { domainId: 'team', uid: 1, pid: 1, lang: 'cc', code: 'wrong' });
    await assert.rejects(model.bind(1, 'team', checkpoint, rid, 1, 'cc', 'wrong'));
    await assert.rejects(model.bind(1, 'team', sourceId, rid, 1, 'cc', 'wrong'));
});

test('contest replay binds numeric problem ID and route tid, then remains readable through the data endpoint', async () => {
    const { model, records, routes } = await fixture();
    const tid = new ObjectId();
    const rid = new ObjectId();
    records.set(String(rid), { domainId: 'team', uid: 1, pid: 42, contest: tid, lang: 'cc', code: 'abc' });
    // Previous UI uploaded the display PID, while the judge record stores the numeric ID.
    await model.appendContinuous(1, 'team', sourceId, { ...base, pid: 'J0002', tid, events: [first] });
    const invalid = await model.checkpoint(1, 'team', sourceId, {
        ...base, pid: 'J0002', tid, finalCode: 'abc', endSeq: 1, endTime: 150,
    });
    await assert.rejects(model.bind(1, 'team', invalid, rid, 42, 'cc', 'abc'));
    const correctSource = 'b'.repeat(48);
    await model.appendContinuous(1, 'team', correctSource, { ...base, pid: '42', tid, events: [first] });
    const checkpoint = await model.checkpoint(1, 'team', correctSource, {
        ...base, pid: '42', tid, finalCode: 'abc', endSeq: 1, endTime: 150,
    });
    await model.bind(1, 'team', checkpoint, rid, 42, 'cc', 'abc');
    const handler = new (routes.get('code_replay_data'))();
    handler.response = {};
    await handler.get('team', rid);
    assert.equal(handler.response.body.replay.finalCode, 'abc');
    assert.equal(handler.response.body.replay.events.length, 1);
    assert.equal(String(handler.response.body.replay.tid), String(tid));
    assert.equal(String(handler.response.body.replay.rid), String(rid));
});

test('self-test hook never binds a replay, even if a client supplies a checkpoint ID', async () => {
    const { model, sessions, hooks } = await fixture();
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [first] });
    const checkpoint = await model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'abc', endSeq: 1, endTime: 150 });
    await hooks.get('handler/after/ProblemSubmit#post')!({
        args: { pretest: true, codeReplaySessionId: checkpoint, domainId: 'team' },
        user: { _id: 1 }, response: { body: { rid: new ObjectId() } },
    });
    assert.equal(sessions.docs.get(checkpoint).rid, undefined);
});

test('hidden contest responses bind using the internal rid without disclosing it', async () => {
    const { model, sessions, records, hooks } = await fixture();
    const tid = new ObjectId();
    await model.appendContinuous(1, 'team', sourceId, { ...base, tid, events: [first] });
    const checkpoint = await model.checkpoint(1, 'team', sourceId, { ...base, tid, finalCode: 'abc', endSeq: 1, endTime: 150 });
    const rid = new ObjectId();
    records.set(String(rid), { domainId: 'team', uid: 1, pid: 1, contest: tid, lang: 'cc', code: 'abc' });
    const handler: any = {
        args: { pretest: false, codeReplaySessionId: checkpoint, domainId: 'team', pid: '1', lang: 'cc', code: 'abc' },
        submittedRecordId: rid, user: { _id: 1 }, response: { body: { tid } },
    };
    await hooks.get('handler/after/ProblemSubmit#post')!(handler);
    assert.equal(String(sessions.docs.get(checkpoint).rid), String(rid));
    assert.equal(handler.response.body.codeReplayCommitted, true);
    assert.equal(handler.response.body.rid, undefined);
    // Retrying the same binding is idempotent and does not disclose the ID either.
    await hooks.get('handler/after/ProblemSubmit#post')!(handler);
    assert.equal(handler.response.body.codeReplayCommitted, true);
    assert.equal(handler.response.body.rid, undefined);
});

test('binding failure is explicit even when the contest response hides rid', async () => {
    const { model, hooks, records } = await fixture();
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [first] });
    const checkpoint = await model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'abc', endSeq: 1, endTime: 150 });
    const rid = new ObjectId();
    records.set(String(rid), { domainId: 'team', uid: 2, pid: 1, lang: 'cc', code: 'abc' });
    const handler: any = {
        args: { codeReplaySessionId: checkpoint, domainId: 'team' }, submittedRecordId: rid,
        user: { _id: 1 }, response: { body: { tid: new ObjectId() } },
    };
    await hooks.get('handler/after/ProblemSubmit#post')!(handler);
    assert.equal(handler.response.body.codeReplayError, true);
    assert.equal(handler.response.body.codeReplayCommitted, undefined);
    assert.equal(handler.response.body.rid, undefined);
});

test('both replay endpoints enforce the shared record access decision', async () => {
    let checks = 0;
    const { model, records, routes } = await fixture(async (_handler, record) => {
        checks++;
        assert.equal(record.domainId, 'team');
        throw new Error('Hidden problem');
    });
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [first] });
    const checkpoint = await model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'abc', endSeq: 1, endTime: 150 });
    const rid = new ObjectId();
    records.set(String(rid), { domainId: 'team', uid: 1, pid: 1, lang: 'cc', code: 'abc' });
    await model.bind(1, 'team', checkpoint, rid, 1, 'cc', 'abc');
    await Promise.all(['code_replay', 'code_replay_data'].map(async (route) => {
        const handler = new (routes.get(route))();
        await assert.rejects(handler.get('team', rid), /Hidden problem/);
    }));
    assert.equal(checks, 2);
});

test('legacy replay sessions still append, bind, and load without a migration', async () => {
    const { model } = await fixture();
    await model.append(1, 'team', sourceId, { ...base, finalCode: 'abc', events: [first], snapshots: [] });
    const rid = new ObjectId();
    await model.bind(1, 'team', sourceId, rid, 1, 'cc', 'abc');
    const replay = await model.getByRid(rid);
    assert.equal(replay.sourceSessionId, undefined);
    assert.equal((await model.getEvents(sourceId, replay)).events[0].changes[0].text, 'abc');
});

test('binding accepts server CRLF normalization without rewriting the immutable replay text', async () => {
    const { model, records } = await fixture();
    const event = { ...first, changes: [{ rangeOffset: 0, rangeLength: 0, text: 'a\r\nb\r\n' }] };
    await model.appendContinuous(1, 'team', sourceId, { ...base, events: [event] });
    const checkpoint = await model.checkpoint(1, 'team', sourceId, { ...base, finalCode: 'a\r\nb\r\n', endSeq: 1, endTime: 150 });
    const rid = new ObjectId();
    records.set(String(rid), { domainId: 'team', uid: 1, pid: 1, lang: 'cc', code: 'a\nb\n' });
    await model.bind(1, 'team', checkpoint, rid, 1, 'cc', 'a\nb\n');
    const replay = await model.getByRid(rid);
    assert.equal(replay.finalCode, 'a\r\nb\r\n');
    assert.equal((await model.getEvents(checkpoint, replay)).events.length, 1);
});
