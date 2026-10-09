import { ObjectId } from 'mongodb';
import { ContestNotAttendedError, ValidationError } from '../error';
import type { ContestStatusDoc, Tdoc } from '../interface';
import { advanceContestActivity, contestActivityBounds } from '../lib/contest-activity';
import db from '../service/db';
import { TYPE_CONTEST } from './document';

const statuses = db.collection('document.status');

export async function heartbeat(domainId: string, tdoc: Tdoc, uid: number, token: string, pid: number, active: boolean) {
    const query = { domainId, docType: TYPE_CONTEST, docId: tdoc.docId, uid, attend: 1 };
    for (let attempt = 0; attempt < 5; attempt++) {
        // All tabs/processes share this revision and settle the previous interval only once.
        // eslint-disable-next-line no-await-in-loop
        const status = await statuses.findOne(query);
        if (!status) throw new ContestNotAttendedError(domainId, tdoc.docId);
        if (!tdoc.pids.includes(pid)) throw new ValidationError('pid');
        const advance = advanceContestActivity(status.problemActivity, token, pid, active, Date.now(), contestActivityBounds(tdoc, status));
        if (!advance) return status;
        const filter = status.problemActivityRev === undefined ? { $exists: false } : status.problemActivityRev;
        // eslint-disable-next-line no-await-in-loop
        const saved = await statuses.findOneAndUpdate({ ...query, problemActivityRev: filter }, {
            $set: { problemActivity: advance.activity },
            $inc: {
                problemActivityRev: 1,
                ...(advance.elapsed && advance.countedPid ? {
                    totalProblemTime: advance.elapsed, [`problemTimes.${advance.countedPid}`]: advance.elapsed,
                } : {}),
            },
        }, { returnDocument: 'after' });
        if (saved) return saved;
    }
    throw new ValidationError('activity', 'Please retry');
}

export async function getTimes(domainId: string, tid: ObjectId) {
    return statuses.find({ domainId, docType: TYPE_CONTEST, docId: tid, attend: 1 })
        .project<Pick<ContestStatusDoc, 'uid' | 'problemTimes' | 'totalProblemTime'>>({ uid: 1, problemTimes: 1, totalProblemTime: 1 }).toArray();
}
