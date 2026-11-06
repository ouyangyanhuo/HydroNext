import { escapeRegExp, pick } from 'lodash';
import { Document, Filter, ObjectId } from 'mongodb';
import { ValidationError } from '../error';
import { Tdoc } from '../interface';
import { PERM } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import problem, { ProblemDoc } from '../model/problem';
import user from '../model/user';
import type { Handler } from '../service/server';
import { getContestListFilter } from './contest-list';

const LIMIT = 20;
const RESERVED_UID_MAX = 2;
export const RECORD_FILTER_KINDS = ['user', 'problem', 'contest'] as const;
type Kind = typeof RECORD_FILTER_KINDS[number];

async function visibleContest(handler: Handler, domainId: string, tid: ObjectId) {
    if (!handler.user.hasPerm(PERM.PERM_VIEW_CONTEST)) return null;
    const { filter } = await getContestListFilter(handler, domainId);
    return (await contest.getMulti(domainId, { $and: [filter, { docId: tid }] }).limit(1).toArray())[0] || null;
}

async function searchUsers(handler: Handler, domainId: string, q: string, exact: boolean, tdoc: Tdoc | null) {
    let allowed: number[] | null = handler.user.hasPerm(PERM.PERM_VIEW_RECORD) ? null : [handler.user._id];
    if (tdoc) {
        if ((contest.isNotStarted(tdoc) && !contest.canViewHiddenScoreboard.call(handler, tdoc))
            || !contest.canShowScoreboard.call(handler, tdoc)
            || !contest.canShowSelfRecord.call(handler, tdoc)) return [];
        if (!contest.canShowRecord.call(handler, tdoc)) allowed = [handler.user._id];
        if (allowed && tdoc.allowTeam) {
            const vid = await contest.getTeamVid(domainId, tdoc.docId, handler.user._id);
            const status = vid ? await contest.getStatus(domainId, tdoc.docId, vid) : null;
            if (status?.attend && status.members?.includes(handler.user._id)) allowed = status.members;
        }
    }
    if (allowed && !allowed.some((uid) => uid > RESERVED_UID_MAX)) return [];
    const numeric = /^\d+$/.test(q) && Number.isSafeInteger(+q) && +q > 0;
    const $regex = escapeRegExp(q.toLowerCase());
    // User accounts are global. Only an explicit joined membership scopes an account to this domain.
    // Start from that scope for every lookup, including exact UID/username hydration and administrators.
    const pipeline: Document[] = [{
        $match: {
            domainId,
            join: true,
            uid: allowed ? { $in: allowed.filter((uid) => uid > RESERVED_UID_MAX) } : { $gt: RESERVED_UID_MAX },
        },
    }];
    if (!q) pipeline.push({ $sort: { uid: -1 } });
    pipeline.push({ $project: { _id: 0, uid: 1, displayName: 1 } }, {
        $lookup: {
            from: user.coll.collectionName,
            let: { uid: '$uid' },
            pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$uid'] } } }, { $project: { unameLower: 1 } }],
            as: 'account',
        },
    }, { $unwind: '$account' });
    if (q) {
        pipeline.push({ $match: { $or: [
            { 'account.unameLower': exact ? q.toLowerCase() : { $regex } },
            ...exact ? [] : [{ displayName: { $regex, $options: 'i' } }],
            ...numeric ? [{ uid: +q }] : [],
        ] } }, {
            $addFields: { matchPriority: { $cond: [
                { $eq: ['$uid', numeric ? +q : null] }, 0,
                { $cond: [{ $eq: ['$account.unameLower', q.toLowerCase()] }, 1, 2] },
            ] } },
        }, { $sort: { matchPriority: 1, uid: -1 } });
    }
    pipeline.push({ $limit: exact ? 1 : LIMIT }, { $project: { _id: 0, uid: 1 } });
    const members = await domain.collUser.aggregate<{ uid: number }>(pipeline).toArray();
    const users = await Promise.all(members.map(({ uid }) => user.getById(domainId, uid)));
    return users.filter(Boolean).map((doc) => pick(doc, ['_id', 'uname', 'displayName']));
}

async function searchProblems(handler: Handler, domainId: string, q: string, exact: boolean, tdoc: Tdoc | null) {
    if (!handler.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) return [];
    const filter: Filter<ProblemDoc> = {};
    if (!handler.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) filter.hidden = { $ne: true };
    if (tdoc) filter.docId = { $in: tdoc.pids };
    if (exact) {
        const pdoc = await problem.get(domainId, /^\d+$/.test(q) && Number.isSafeInteger(+q) ? +q : q);
        if (!pdoc || !problem.canViewBy(pdoc, handler.user) || (tdoc && !tdoc.pids.includes(pdoc.docId))) return [];
        filter.docId = pdoc.docId;
    } else if (q) {
        const $regex = escapeRegExp(q);
        filter.$or = [{ title: { $regex, $options: 'i' } }, { pid: { $regex, $options: 'i' } },
            .../^\d+$/.test(q) && Number.isSafeInteger(+q) ? [{ docId: +q }] : []];
    }
    await handler.ctx.parallel('problem/list', filter, handler);
    const docs = await problem.getMulti(domainId, filter, ['docId', 'pid', 'title', 'hidden'])
        .sort({ docId: -1 }).limit(exact ? 1 : LIMIT).toArray();
    return docs.filter((doc) => problem.canViewBy(doc, handler.user) && (!tdoc || tdoc.pids.includes(doc.docId)))
        .map((doc) => pick(doc, ['docId', 'pid', 'title']));
}

/** Read-only metadata lookup. Never starts a contest or consumes a proctor authentication proof. */
export async function getRecordFilterOptions(
    handler: Handler, domainId: string, kind: Kind, query = '', tid?: ObjectId, exact = false,
) {
    // Bind this endpoint to the domain selected by the URL/host, not a client-supplied domainId parameter.
    if (domainId !== handler.domain._id) throw new ValidationError('domainId');
    if (query.length > 200) throw new ValidationError('q');
    const q = query.trim();
    if (exact && !q) return [];
    if (kind === 'contest') {
        if (!handler.user.hasPerm(PERM.PERM_VIEW_CONTEST)) return [];
        const byId = /^[\da-f]{24}$/i.test(q);
        if (exact && !byId) return [];
        const { filter } = await getContestListFilter(handler, domainId, '', '', byId ? '' : q);
        const docs = await contest.getMulti(domainId, byId ? { $and: [filter, { docId: new ObjectId(q) }] } : filter)
            .project({ docId: 1, title: 1 }).sort({ endAt: -1, beginAt: -1, _id: -1 }).limit(byId ? 1 : LIMIT).toArray();
        return docs.map((doc) => pick(doc, ['docId', 'title']));
    }
    const tdoc = tid ? await visibleContest(handler, domainId, tid) : null;
    if (tid && !tdoc) return [];
    return kind === 'user' ? searchUsers(handler, domainId, q, exact, tdoc) : searchProblems(handler, domainId, q, exact, tdoc);
}
