import { ObjectId } from 'mongodb';
import { ContestNotAttendedError, ValidationError } from '../error';
import type { ContestStatusDoc, Tdoc } from '../interface';
import { advanceContestActivity, contestActivityBounds } from '../lib/contest-activity';
import db from '../service/db';
import { TYPE_CONTEST } from './document';

const statuses = db.collection('document.status');

export async function heartbeat(domainId: string, tdoc: Tdoc, uid: number, token: string, pid: number, active: boolean) {
    const scope = { domainId, docType: TYPE_CONTEST, docId: tdoc.docId };
    const team = tdoc.allowTeam ? await statuses.findOne({ ...scope, members: uid, attend: 1 }) : null;
    const query = team ? { ...scope, uid } : { ...scope, uid, attend: 1 };
    if (team) {
        // Keep independent member leases; one teammate's tab must not stop another.
        await statuses.updateOne(query, { $setOnInsert: query }, { upsert: true });
    }
    for (let attempt = 0; attempt < 5; attempt++) {
        // All tabs/processes share this revision and settle the previous interval only once.
        // eslint-disable-next-line no-await-in-loop
        const status = await statuses.findOne(query);
        if (!status) throw new ContestNotAttendedError(domainId, tdoc.docId);
        if (!tdoc.pids.includes(pid)) throw new ValidationError('pid');
        const bounds = team ? { ...status, startAt: team.startAt, endAt: team.endAt } : status;
        const advance = advanceContestActivity(status.problemActivity, token, pid, active, Date.now(), contestActivityBounds(tdoc, bounds));
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
    const scope = { domainId, docType: TYPE_CONTEST, docId: tid };
    const times = await statuses.find({ ...scope, attend: 1 })
        .project<Pick<ContestStatusDoc, 'uid' | 'members' | 'problemTimes' | 'totalProblemTime'>>({
            uid: 1, members: 1, problemTimes: 1, totalProblemTime: 1,
        }).toArray();
    const memberUids = [...new Set(times.flatMap((status) => status.members || []))];
    if (!memberUids.length) return times;
    const members = await statuses.find({ ...scope, uid: { $in: memberUids } })
        .project<Pick<ContestStatusDoc, 'uid' | 'problemTimes' | 'totalProblemTime'>>({ uid: 1, problemTimes: 1, totalProblemTime: 1 }).toArray();
    const byUid = new Map(members.map((status) => [status.uid, status]));
    return times.map((status) => {
        if (!status.members?.length) return status;
        const problemTimes: Record<number, number> = {};
        let totalProblemTime = 0;
        for (const uid of status.members) {
            const member = byUid.get(uid);
            totalProblemTime += member?.totalProblemTime || 0;
            for (const [pid, value] of Object.entries(member?.problemTimes || {})) {
                problemTimes[+pid] = (problemTimes[+pid] || 0) + value;
            }
        }
        return { ...status, problemTimes, totalProblemTime };
    });
}
