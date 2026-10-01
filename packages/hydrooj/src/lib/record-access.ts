import { ContestNotFoundError, PermissionError } from '../error';
import type { RecordDoc, Tdoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import problem from '../model/problem';
import type { Handler } from '../service/server';

/** Shared by record details and replay endpoints; code privileges never bypass problem visibility. */
export async function getRecordAccess(handler: Handler, rdoc: RecordDoc) {
    const owner = rdoc.uid === handler.user._id;
    if (!owner && !handler.user.hasPerm(PERM.PERM_VIEW_RECORD)) throw new PermissionError(PERM.PERM_VIEW_RECORD);
    let tdoc: Tdoc = null;
    let canViewDetail = true;
    if (rdoc.contest?.toString().startsWith('0'.repeat(23))) {
        if (!owner) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
    } else if (rdoc.contest) {
        tdoc = await contest.get(rdoc.domainId, rdoc.contest);
        if (!tdoc) throw new ContestNotFoundError(rdoc.domainId, rdoc.contest);
        canViewDetail = handler.user.own(tdoc)
            || contest.canShowRecord.call(handler, tdoc)
            || (owner && contest.canShowSelfRecord.call(handler, tdoc, true));
        if (!canViewDetail && !owner) throw new PermissionError(rdoc._id);
    }
    const [pdoc, self, tsdoc] = await Promise.all([
        problem.get(rdoc.domainId, rdoc.pid, problem.PROJECTION_LIST.concat('config')),
        problem.getStatus(rdoc.domainId, rdoc.pid, handler.user._id),
        tdoc ? contest.getStatus(rdoc.domainId, tdoc.docId, handler.user._id) : Promise.resolve(null),
    ]);
    if ((!tdoc || !tsdoc?.attend) && pdoc && !problem.canViewBy(pdoc, handler.user)) {
        throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
    }
    const canViewCode = owner
        || handler.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)
        || handler.user.hasPerm(PERM.PERM_READ_RECORD_CODE)
        || (handler.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED)
        || (tdoc && (handler.user.own(tdoc) || (tdoc.allowViewCode && contest.isDone(tdoc) && !!tsdoc?.attend)));
    return { pdoc, tdoc, tsdoc, canViewDetail, canViewCode: !!canViewCode };
}
