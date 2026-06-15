import {
    ContestModel, Context, db, Handler, NotFoundError, ObjectId,
    PERM, PRIV, PermissionError, ProblemModel, RecordModel,
    RecordNotFoundError, STATUS, UserModel, ValidationError, param,
    Types,
} from 'hydrooj';

interface ReplayChange {
    rangeOffset: number;
    rangeLength: number;
    text: string;
    range?: unknown;
}

interface ReplayEvent {
    t: number;
    changes: ReplayChange[];
    selections?: unknown[];
    lang?: string;
}

interface ReplaySnapshot {
    t: number;
    code: string;
    lang?: string;
}

interface CodeReplaySession {
    _id: string;
    domainId: string;
    uid: number;
    pid: number | string;
    tid?: ObjectId;
    rid?: ObjectId;
    lang?: string;
    initialCode: string;
    finalCode?: string;
    events?: ReplayEvent[];
    snapshots?: ReplaySnapshot[];
    createdAt: Date;
    updatedAt: Date;
    submittedAt?: Date;
    expiresAt?: Date;
}

interface CodeReplayChunk {
    _id: ObjectId;
    sessionId: string;
    domainId: string;
    uid: number;
    rid?: ObjectId;
    events: ReplayEvent[];
    snapshots: ReplaySnapshot[];
    createdAt: Date;
    expiresAt?: Date;
}

declare module 'hydrooj' {
    interface Collections {
        code_replay: CodeReplaySession;
        code_replay_chunk: CodeReplayChunk;
    }
    interface Model {
        codeReplay: typeof CodeReplayModel;
    }
}

const coll = db.collection('code_replay');
const collChunk = db.collection('code_replay_chunk');
const MAX_BATCH_EVENTS = 500;
const MAX_BATCH_SNAPSHOTS = 20;
const MAX_EVENT_SIZE = 128 * 1024;
const MAX_CODE_SIZE = 512 * 1024;
const UNBOUND_EXPIRE_SECONDS = 7 * 24 * 3600;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,80}$/;

function trimCode(code: string) {
    code ||= '';
    return code.length > MAX_CODE_SIZE ? code.slice(-MAX_CODE_SIZE) : code;
}

function normalizeEvent(event: any): ReplayEvent | null {
    if (!event || typeof event !== 'object') return null;
    const changes = event.changes instanceof Array ? event.changes : [];
    const normalizedChanges = changes.map((change) => ({
        rangeOffset: Number(change.rangeOffset),
        rangeLength: Number(change.rangeLength),
        text: String(change.text || ''),
        range: change.range,
    })).filter((change) => (
        Number.isSafeInteger(change.rangeOffset)
        && Number.isSafeInteger(change.rangeLength)
        && change.rangeOffset >= 0
        && change.rangeLength >= 0
    ));
    if (!normalizedChanges.length) return null;
    const normalized: ReplayEvent = {
        t: Math.max(0, Number(event.t) || 0),
        changes: normalizedChanges,
        selections: event.selections instanceof Array ? event.selections : undefined,
        lang: typeof event.lang === 'string' ? event.lang : undefined,
    };
    if (JSON.stringify(normalized).length > MAX_EVENT_SIZE) return null;
    return normalized;
}

function normalizeSnapshot(snapshot: any): ReplaySnapshot | null {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
        t: Math.max(0, Number(snapshot.t) || 0),
        code: trimCode(String(snapshot.code || '')),
        lang: typeof snapshot.lang === 'string' ? snapshot.lang : undefined,
    };
}

export class CodeReplayModel {
    static async ensureIndexes() {
        await Promise.all([
            coll.createIndex({ rid: 1 }, { sparse: true }),
            coll.createIndex({ uid: 1, updatedAt: -1 }),
            coll.createIndex({ domainId: 1, pid: 1, updatedAt: -1 }),
            coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
            collChunk.createIndex({ sessionId: 1, _id: 1 }),
            collChunk.createIndex({ uid: 1, createdAt: -1 }),
            collChunk.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        ]);
    }

    static async append(
        uid: number, domainId: string, sessionId: string,
        payload: Partial<CodeReplaySession> & { events?: ReplayEvent[], snapshots?: ReplaySnapshot[] },
    ) {
        if (!SESSION_ID_RE.test(sessionId)) throw new ValidationError('sessionId');
        const now = new Date();
        const $set: Partial<CodeReplaySession> = {
            updatedAt: now,
        };
        if (payload.lang) $set.lang = payload.lang;
        if (typeof payload.finalCode === 'string') $set.finalCode = trimCode(payload.finalCode);
        const update: any = {
            $set,
            $setOnInsert: {
                _id: sessionId,
                domainId,
                uid,
                pid: payload.pid,
                tid: payload.tid,
                initialCode: trimCode(payload.initialCode || ''),
                createdAt: now,
                expiresAt: new Date(Date.now() + UNBOUND_EXPIRE_SECONDS * 1000),
            },
        };
        const events = payload.events?.slice(0, MAX_BATCH_EVENTS) || [];
        const snapshots = payload.snapshots?.slice(0, MAX_BATCH_SNAPSHOTS) || [];
        await coll.updateOne({ _id: sessionId, uid }, update, { upsert: true });
        if (events.length || snapshots.length) {
            await collChunk.insertOne({
                _id: new ObjectId(),
                sessionId,
                domainId,
                uid,
                events,
                snapshots,
                createdAt: now,
                expiresAt: new Date(Date.now() + UNBOUND_EXPIRE_SECONDS * 1000),
            });
        }
    }

    static async bind(
        uid: number, domainId: string, sessionId: string, rid: ObjectId,
        pid?: number | string, lang?: string, finalCode?: string,
    ) {
        if (!SESSION_ID_RE.test(sessionId)) return;
        const now = new Date();
        const $set: Partial<CodeReplaySession> = {
            rid,
            submittedAt: now,
            updatedAt: now,
        };
        if (lang) $set.lang = lang;
        if (typeof finalCode === 'string') $set.finalCode = trimCode(finalCode);
        // $unset expiresAt so MongoDB TTL index ignores bound sessions
        await coll.updateOne({ _id: sessionId, uid, domainId }, {
            $set,
            $unset: { expiresAt: '' },
            $setOnInsert: {
                _id: sessionId,
                domainId,
                uid,
                pid,
                initialCode: trimCode(finalCode || ''),
                createdAt: now,
            },
        }, { upsert: true });
        await collChunk.updateMany(
            { sessionId, uid, domainId },
            { $set: { rid }, $unset: { expiresAt: '' } },
        );
    }

    static async getByRid(rid: ObjectId) {
        return await coll.findOne({ rid });
    }

    static async getEvents(sessionId: string) {
        const chunks = await collChunk.find({ sessionId }).sort({ _id: 1 }).toArray();
        return {
            events: chunks.flatMap((chunk) => chunk.events || []).sort((a, b) => a.t - b.t),
            snapshots: chunks.flatMap((chunk) => chunk.snapshots || []).sort((a, b) => a.t - b.t),
        };
    }
}

global.Hydro.model.codeReplay = CodeReplayModel;

function domainAwareUrl(handler: Handler, name: string, args: Record<string, any> = {}) {
    const url = handler.url(name, args);
    const prefix = `/d/${handler.args.domainId}/`;
    if (handler.context.originalPath?.startsWith(prefix) && url.startsWith('/')) return `/d/${handler.args.domainId}${url}`;
    return url;
}

/**
 * Check whether the current user can view the source code of a record.
 * Returns true if allowed, false otherwise. Does NOT throw.
 */
async function canViewRecordCode(handler: Handler, rdoc: any): Promise<boolean> {
    // Owner can always view their own code
    if (rdoc.uid === handler.user._id) return true;

    // Non-owner must have PERM_VIEW_RECORD
    if (!handler.user.hasPerm(PERM.PERM_VIEW_RECORD)) return false;

    // Training-type contest (prefix of 23 zeros) — only owner can view
    if (rdoc.contest?.toString().startsWith('0'.repeat(23))) return false;

    let tdoc = null;
    if (rdoc.contest) {
        tdoc = await ContestModel.get(rdoc.domainId, rdoc.contest);
        let canView = handler.user.own(tdoc);
        canView ||= ContestModel.canShowRecord.call(handler, tdoc);
        canView ||= ContestModel.canShowSelfRecord.call(handler, tdoc, true) && rdoc.uid === handler.user._id;
        if (!canView) return false;
    }

    // Global privilege to read any record code
    if (handler.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) return true;
    if (handler.user.hasPerm(PERM.PERM_READ_RECORD_CODE)) return true;

    const [pdoc, self] = await Promise.all([
        ProblemModel.get(rdoc.domainId, rdoc.pid, ProblemModel.PROJECTION_LIST.concat('config')),
        ProblemModel.getStatus(rdoc.domainId, rdoc.pid, handler.user._id),
    ]);

    if (handler.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED) return true;

    if (tdoc) {
        const tsdoc = await ContestModel.getStatus(rdoc.domainId, tdoc.docId, handler.user._id);
        if (handler.user.own(tdoc)) return true;
        if (tdoc?.allowViewCode && ContestModel.isDone(tdoc) && !!tsdoc?.attend) return true;
        if (!tsdoc?.attend && pdoc && !ProblemModel.canViewBy(pdoc, handler.user)) return false;
    } else if (pdoc && !ProblemModel.canViewBy(pdoc, handler.user)) {
        return false;
    }

    return false;
}

async function getReplayForHandler(handler: Handler, domainId: string, rid: ObjectId) {
    const [rdoc, replay] = await Promise.all([
        RecordModel.get(domainId, rid),
        CodeReplayModel.getByRid(rid),
    ]);
    if (!rdoc) throw new RecordNotFoundError(rid);
    if (!replay) throw new NotFoundError('Code replay');
    if (!(await canViewRecordCode(handler, rdoc))) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
    const [pdoc, udoc] = await Promise.all([
        ProblemModel.get(rdoc.domainId, rdoc.pid, ProblemModel.PROJECTION_LIST),
        UserModel.getById(rdoc.domainId, rdoc.uid),
    ]);
    return { rdoc, replay, pdoc, udoc };
}

class CodeReplaySessionHandler extends Handler {
    @param('sessionId', Types.String)
    @param('pid', Types.Name)
    @param('tid', Types.ObjectId, true)
    @param('lang', Types.Name, true)
    @param('initialCode', Types.String, true)
    @param('finalCode', Types.String, true)
    async post(
        domainId: string,
        sessionId: string,
        pid: string,
        tid?: ObjectId,
        lang?: string,
        initialCode = '',
        finalCode?: string,
    ) {
        if (!this.user?._id) throw new PermissionError(PRIV.PRIV_USER_PROFILE);
        await this.limitRate('code_replay_append', 60, 120);
        // events/snapshots are complex types — read from args directly
        const rawEvents = this.args.events instanceof Array ? this.args.events : [];
        const rawSnapshots = this.args.snapshots instanceof Array ? this.args.snapshots : [];
        const normalizedEvents = rawEvents
            .map(normalizeEvent)
            .filter(Boolean) as ReplayEvent[];
        const normalizedSnapshots = rawSnapshots
            .map(normalizeSnapshot)
            .filter(Boolean) as ReplaySnapshot[];
        await CodeReplayModel.append(this.user._id, domainId, sessionId, {
            pid,
            tid,
            lang,
            initialCode,
            finalCode,
            events: normalizedEvents,
            snapshots: normalizedSnapshots,
        });
        this.response.body = { ok: 1 };
    }
}

class CodeReplayViewHandler extends Handler {
    @param('rid', Types.ObjectId)
    async get(domainId: string, rid: ObjectId) {
        const {
            replay, rdoc, pdoc, udoc,
        } = await getReplayForHandler(this, domainId, rid);
        this.UiContext.codeReplayDataUrl = domainAwareUrl(this, 'code_replay_data', { rid });
        this.response.template = 'code_replay.html';
        this.response.body = {
            page_name: 'code_replay',
            replay,
            rdoc,
            pdoc,
            udoc,
        };
    }
}

class CodeReplayDataHandler extends Handler {
    @param('rid', Types.ObjectId)
    async get(domainId: string, rid: ObjectId) {
        const {
            replay, rdoc, pdoc, udoc,
        } = await getReplayForHandler(this, domainId, rid);
        const replayData = await CodeReplayModel.getEvents(replay._id);
        this.response.body = {
            replay: {
                _id: replay._id,
                uid: replay.uid,
                pid: replay.pid,
                tid: replay.tid,
                rid: replay.rid,
                lang: replay.lang,
                initialCode: replay.initialCode || '',
                finalCode: replay.finalCode || '',
                events: replayData.events.concat(replay.events || []),
                snapshots: replayData.snapshots.concat(replay.snapshots || []),
                createdAt: replay.createdAt,
                submittedAt: replay.submittedAt,
            },
            rdoc: {
                _id: rdoc._id,
                uid: rdoc.uid,
                pid: rdoc.pid,
                lang: rdoc.lang,
            },
            pdoc: pdoc && {
                docId: pdoc.docId,
                pid: pdoc.pid,
                title: pdoc.title,
            },
            udoc: udoc && {
                _id: udoc._id,
                uname: udoc.uname,
                displayName: udoc.displayName,
            },
        };
    }
}

export async function apply(ctx: Context) {
    const logger = ctx.logger('code-replay');
    await CodeReplayModel.ensureIndexes();
    ctx.Route('code_replay_session', '/code-replay/session', CodeReplaySessionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('code_replay', '/record/:rid/replay', CodeReplayViewHandler);
    ctx.Route('code_replay_data', '/record/:rid/replay/data', CodeReplayDataHandler);

    ctx.on('handler/after/ProblemSubmit#post', async (that) => {
        if (that.args.pretest) return;
        const sessionId = that.args.codeReplaySessionId;
        const rid = that.response.body?.rid;
        if (!sessionId || !rid) return;
        try {
            await CodeReplayModel.bind(
                that.user._id, that.args.domainId, sessionId, rid,
                that.args.pid, that.args.lang, that.args.code,
            );
        } catch (e) {
            logger.warn('Failed to bind replay session %s to record %s: %o', sessionId, rid, e);
        }
    });

    ctx.on('handler/after/RecordDetail#get', async (that) => {
        const rdoc = that.response.body?.rdoc;
        if (!rdoc?._id || !rdoc.code) return;
        try {
            const replay = await CodeReplayModel.getByRid(rdoc._id);
            if (!replay) return;
            that.UiContext.codeReplayUrl = domainAwareUrl(that, 'code_replay', { rid: rdoc._id });
        } catch (e) {
            logger.warn('Failed to inject replay entry for record %s: %o', rdoc._id, e);
        }
    });

    ctx.on('handler/after/ProblemDetail#get', (that) => {
        that.UiContext.codeReplaySessionUrl = domainAwareUrl(that, 'code_replay_session');
    });

    ctx.i18n.load('zh', {
        code_replay: '代码回放',
        'Code Replay': '代码回放',
        'Replay editing process': '回放编辑过程',
        'No replay data is available.': '没有可用的回放数据。',
        'Play': '播放',
        'Pause': '暂停',
        'Restart': '重新开始',
        'Previous Step': '上一步',
        'Next Step': '下一步',
        'Speed': '速度',
        'Events': '事件数',
        'Duration': '持续时间',
    });
    ctx.i18n.load('en', {
        code_replay: 'Code Replay',
    });
}
