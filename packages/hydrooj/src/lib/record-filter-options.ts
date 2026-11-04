import { escapeRegExp, pick } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
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
    const exactUser = numeric ? await user.getById(domainId, +q) : null;
    const named = exactUser || (q ? await user.getByUname(domainId, q) : null);
    const $regex = escapeRegExp(q.toLowerCase());
    // Apply the permission scope before limiting/searching, not after fetching arbitrary users.
    const uidFilter = allowed
        ? { _id: { $in: allowed.filter((uid) => uid > RESERVED_UID_MAX) } }
        : { _id: { $gt: RESERVED_UID_MAX } };
    const candidates = exact ? [] : await Promise.all([
        user.getMulti({ ...uidFilter, ...q ? { unameLower: { $regex } } : {} }, ['_id']).sort({ _id: -1 }).limit(LIMIT).toArray(),
        domain.getMultiUserInDomain(domainId, {
            ...allowed ? { uid: { $in: allowed.filter((uid) => uid > RESERVED_UID_MAX) } } : { uid: { $gt: RESERVED_UID_MAX } },
            displayName: { $regex, $options: 'i' },
        }).project({ uid: 1 }).limit(LIMIT).toArray(),
    ]);
    const ids = new Set<number>([
        ...named ? [named._id] : [],
        ...(candidates[0] || []).map((doc) => doc._id),
        ...(candidates[1] || []).map((doc) => doc.uid),
    ].filter((uid) => uid > RESERVED_UID_MAX && (!allowed || allowed.includes(uid))));
    const users = await Promise.all([...ids].slice(0, LIMIT).map((uid) => user.getById(domainId, uid)));
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
