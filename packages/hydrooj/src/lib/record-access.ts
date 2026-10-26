import { ContestNotAttendedError, ContestNotFoundError, PermissionError } from '../error';
import type { RecordDoc, Tdoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import problem from '../model/problem';
import type { ConnectionHandler, Handler } from '../service/server';
import { requireContestRecordAccess } from './contest-security';

type AccessCache = <T>(key: string, load: () => Promise<T>) => Promise<T>;

async function resolveRecordAccess(handler: Handler | ConnectionHandler, rdoc: RecordDoc, authorizeContent: boolean, cache?: AccessCache) {
    const read: AccessCache = cache || ((_key, load) => load());
    const key = (kind: string, value: unknown) => JSON.stringify([kind, rdoc.domainId, value]);
    const ownSubmission = rdoc.uid === handler.user._id;
    const owner = ownSubmission || (rdoc.contest && !rdoc.contest.toString().startsWith('0'.repeat(23))
        && await read(key('owner', rdoc._id), () => contest.isOwnOrTeammateRecord(rdoc.domainId, rdoc, handler.user._id)));
    if (!owner && !handler.user.hasPerm(PERM.PERM_VIEW_RECORD)) throw new PermissionError(PERM.PERM_VIEW_RECORD);
    let tdoc: Tdoc = null;
    let canViewDetail = true;
    const isSpecial = rdoc.contest?.toString().startsWith('0'.repeat(23));
    const isPretest = rdoc.contest?.toString() === '0'.repeat(24);
    const contextContest = isPretest ? rdoc.pretestContest : rdoc.contest;
    if (isSpecial) {
        if (!owner) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
    }
    if (contextContest && (!isSpecial || isPretest)) {
        tdoc = await read(key('contest', contextContest), () => contest.get(rdoc.domainId, contextContest));
        if (!tdoc) throw new ContestNotFoundError(rdoc.domainId, contextContest);
        if (isPretest && !tdoc.pids.includes(rdoc.pid)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        // A private self-test is not an official score; OI/封榜 projection must not hide its output.
        canViewDetail = isPretest || handler.user.own(tdoc)
            || contest.canShowRecord.call(handler, tdoc)
            || (owner && contest.canShowSelfRecord.call(handler, tdoc, true));
        if (!canViewDetail && !owner) throw new PermissionError(rdoc._id);
    }
    const accessGrant = authorizeContent ? await requireContestRecordAccess(handler, tdoc, rdoc) : undefined;
    const teamVid = tdoc?.allowTeam
        ? await read(key('team', tdoc.docId), () => contest.getTeamVid(rdoc.domainId, tdoc.docId, handler.user._id)) : null;
    const [pdoc, self, tsdoc] = await Promise.all([
        read(key('problem', rdoc.pid), () => problem.get(rdoc.domainId, rdoc.pid, problem.PROJECTION_LIST.concat('config'))),
        read(key('self', rdoc.pid), () => problem.getStatus(rdoc.domainId, rdoc.pid, handler.user._id)),
        tdoc ? read(key('status', tdoc.docId), () => contest.getStatus(rdoc.domainId, tdoc.docId, teamVid ?? handler.user._id))
            : Promise.resolve(null),
    ]);
    if (isPretest && tdoc && !tsdoc?.attend && !handler.user.own(tdoc) && !handler.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
        throw new ContestNotAttendedError(contextContest);
    }
    if ((!tdoc || !tsdoc?.attend) && pdoc && !problem.canViewBy(pdoc, handler.user)) {
        throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
    }
    const canViewCode = owner
        || handler.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)
        || handler.user.hasPerm(PERM.PERM_READ_RECORD_CODE)
        || (handler.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED)
        || (tdoc && (handler.user.own(tdoc) || (tdoc.allowViewCode && contest.isDone(tdoc) && !!tsdoc?.attend)));
    return {
        pdoc, tdoc, tsdoc, canViewDetail, canViewCode: !!canViewCode, accessGrant,
        /** @deprecated Use accessGrant.assert(); this is an opaque grant, not a raw proctor session. */
        proctorSession: accessGrant,
    };
}

/** Actual content endpoints always perform monitoring authentication as well as permissions. */
export function getRecordAccess(handler: Handler | ConnectionHandler, rdoc: RecordDoc) {
    return resolveRecordAccess(handler, rdoc, true);
}

/** UI hints only: never grants content access or consumes a single-use proctor proof. */
export async function getRecordAccessHints(handler: Handler, records: RecordDoc[]) {
    const pending = new Map<string, Promise<unknown>>();
    const cache: AccessCache = (key, load) => {
        if (!pending.has(key)) pending.set(key, load());
        return pending.get(key) as ReturnType<typeof load>;
    };
    return Object.fromEntries(await Promise.all(records.map(async (rdoc) => {
        try {
            const access = await resolveRecordAccess(handler, rdoc, false, cache);
            return [String(rdoc._id), access.canViewCode && access.canViewDetail];
        } catch {
            return [String(rdoc._id), false];
        }
    })));
}
