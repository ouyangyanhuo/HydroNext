import {
    ContestModel, Context, ForbiddenError, ProblemModel, type RecordDoc, RecordModel, type Tdoc, ValidationError,
} from 'hydrooj';

declare module 'hydrooj' {
    interface Tdoc { objectiveOnce?: boolean }
}
type OnceRecord = RecordDoc & { objectiveOnceKey?: string };

export function enabled(tdoc?: Partial<Tdoc>) {
    return !!tdoc?.objectiveOnce && tdoc.rule !== 'homework';
}

export function submissionKey(domainId: string, tid: unknown, pid: number, owner: number) {
    return JSON.stringify([domainId, String(tid), pid, owner]);
}

async function participant(tdoc: Tdoc, uid: number) {
    return tdoc.allowTeam ? await ContestModel.getTeamVid(tdoc.domainId, tdoc.docId, uid) ?? uid : uid;
}

async function findSubmission(tdoc: Tdoc, pid: number, owner: number) {
    const key = submissionKey(tdoc.domainId, tdoc.docId, pid, owner);
    const marked = await RecordModel.coll.findOne({ objectiveOnceKey: key });
    if (marked) return marked;
    // Also count submissions made before the addon was installed or the policy was enabled.
    const previous = RecordModel.getMulti(tdoc.domainId, {
        contest: tdoc.docId, pid, objectiveOnceKey: { $exists: false },
        ...(tdoc.allowTeam ? { $or: [{ contestUid: owner }, { contestUid: { $exists: false } }] } : { uid: owner }),
    }).sort('_id', 1);
    for await (const record of previous) {
        if (await ContestModel.getRecordContestUid(record) === owner) return record;
    }
    return null;
}

function checkPolicy(tdoc: Tdoc | undefined, value: boolean) {
    if (tdoc && !!tdoc.objectiveOnce !== value && Date.now() >= tdoc.beginAt.getTime()) {
        throw new ForbiddenError('The objective submission policy cannot change after the contest starts.');
    }
}

export async function apply(ctx: Context) {
    // Await index creation before registering any hooks: every worker must enforce the same invariant.
    await RecordModel.coll.createIndex({ objectiveOnceKey: 1 }, {
        name: 'unique_objective_once', unique: true,
        partialFilterExpression: { objectiveOnceKey: { $type: 'string' } },
    });
    ctx.on('contest/edit-settings', (handler, settings) => {
        const current = (handler as any).tdoc as Tdoc | undefined;
        const raw = handler.args.objectiveOnce;
        if (raw !== undefined && ![true, false, 'true', 'false', 'on', 'off', '1', '0', 1, 0, ''].includes(raw)) {
            throw new ValidationError('objectiveOnce');
        }
        const value = raw === undefined ? !!current?.objectiveOnce : [true, 'true', 'on', '1', 1].includes(raw);
        checkPolicy(current, value);
        settings.objectiveOnce = value;
    });
    ctx.on('contest/before-edit', (tdoc, changes) => {
        if ('objectiveOnce' in changes) checkPolicy(tdoc, !!changes.objectiveOnce);
    });
    ctx.on('handler/after/ContestEdit#get', (handler) => {
        handler.response.body.objectiveOnceLocked = !!handler.tdoc && Date.now() >= handler.tdoc.beginAt.getTime();
    });
    ctx.on('record/before-add', async (record: OnceRecord) => {
        // Private self-tests/generators have sentinel contest IDs; rejudging updates the original record.
        if (!record.contest || record.contest.equals(RecordModel.RECORD_PRETEST) || record.contest.equals(RecordModel.RECORD_GENERATE)) return;
        const tdoc = await ContestModel.get(record.domainId, record.contest);
        if (!enabled(tdoc)) return;
        let pdoc = await ProblemModel.get(record.domainId, record.pid);
        if (pdoc?.reference) pdoc = await ProblemModel.get(pdoc.reference.domainId, pdoc.reference.pid);
        if (typeof pdoc?.config !== 'object' || pdoc.config?.type !== 'objective') return;
        const owner = await participant(tdoc, record.uid);
        if (await findSubmission(tdoc, record.pid, owner)) {
            throw new ForbiddenError('This objective problem can only be submitted once in this contest.');
        }
        record.objectiveOnceKey = submissionKey(record.domainId, record.contest, record.pid, owner);
    });
    ctx.on('record/insert-error', (record: OnceRecord, error: any) => {
        if (record.objectiveOnceKey && error?.code === 11000 && error?.keyPattern?.objectiveOnceKey) {
            throw new ForbiddenError('This objective problem can only be submitted once in this contest.');
        }
    });
    ctx.on('handler/after/ProblemDetail#get', async (handler) => {
        const tdoc = handler.tdoc as Tdoc;
        if (!enabled(tdoc) || handler.pdoc?.config?.type !== 'objective') return;
        const previous = await findSubmission(tdoc, handler.pdoc.docId, await participant(tdoc, handler.user._id));
        handler.response.body.objectiveSubmission = {
            once: true, submitted: !!previous,
            // Own/team answers are safe to restore even when the contest hides all judging feedback.
            answers: previous?.code || '',
        };
    });
}
