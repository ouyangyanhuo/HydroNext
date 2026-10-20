import { ObjectId } from 'mongodb';
import { Context } from '../context';
import type { ContestStatusDoc, Tdoc } from '../interface';
import db from '../service/db';
import * as announcements from './contest-announcement';
import * as document from './document';

interface EndJob {
    _id: string;
    domainId: string;
    tid: ObjectId;
    uid: number;
    deadline: Date;
    retryAt: Date;
    lockedUntil: Date;
    claim?: ObjectId;
}

declare module '../service/db' {
    interface Collections { 'contest.end-notice': EndJob }
}

const jobs = db.collection('contest.end-notice');
const scope = (domainId: string, tid: ObjectId) => ({ domainId, docType: document.TYPE_CONTEST, docId: tid });
const jobId = (domainId: string, tid: ObjectId, uid: number) => `${domainId}/${tid}/${uid}`;
const timeProjection = { uid: 1, attend: 1, startAt: 1, endAt: 1, members: 1 };
const contestProjection = { domainId: 1, docId: 1, title: 1, rule: 1, endAt: 1, duration: 1, proctorEnabled: 1 };

function deadlineOf(tdoc: Tdoc, status?: ContestStatusDoc) {
    const values = [tdoc.endAt.getTime()];
    if (status?.endAt) values.push(status.endAt.getTime());
    if (tdoc.duration && status?.startAt) values.push(status.startAt.getTime() + tdoc.duration * 3600_000);
    return new Date(Math.min(...values.filter(Number.isFinite)));
}

async function saveJob(tdoc: Tdoc, uid = 0, status?: ContestStatusDoc) {
    const _id = jobId(tdoc.domainId, tdoc.docId, uid);
    const deadline = deadlineOf(tdoc, status);
    if (tdoc.rule === 'homework' || (uid && (!status?.attend || deadline >= tdoc.endAt))) {
        await jobs.deleteOne({ _id });
        return;
    }
    await jobs.updateOne({ _id }, { $set: {
        domainId: tdoc.domainId, tid: tdoc.docId, uid, deadline, retryAt: deadline, lockedUntil: new Date(0),
    }, $unset: { claim: '' } }, { upsert: true });
}

export async function scheduleContest(tdoc: Tdoc) {
    if (tdoc.rule === 'homework') {
        await jobs.deleteMany({ domainId: tdoc.domainId, tid: tdoc.docId });
        return;
    }
    await saveJob(tdoc);
    const statuses = await document.collStatus.find({ ...scope(tdoc.domainId, tdoc.docId), attend: 1 }).project(timeProjection).toArray();
    for (const status of statuses) {
        // eslint-disable-next-line no-await-in-loop
        await saveJob(tdoc, status.uid, status as ContestStatusDoc);
    }
}

export async function scheduleParticipant(domainId: string, tid: ObjectId, uid: number) {
    const [tdoc, status] = await Promise.all([
        document.coll.findOne(scope(domainId, tid), { projection: contestProjection }),
        document.collStatus.findOne({ ...scope(domainId, tid), uid }, { projection: timeProjection }),
    ]);
    if (tdoc) await saveJob(tdoc as Tdoc, uid, status as ContestStatusDoc);
}

/** Private/team completion does not change the contest's global end time or proctor evidence. */
export async function notifyEnded(domainId: string, tid: ObjectId, uid = 0) {
    const tdoc = await document.coll.findOne(scope(domainId, tid), { projection: contestProjection }) as Tdoc;
    if (!tdoc || tdoc.rule === 'homework') return undefined;
    const status = uid ? await document.collStatus.findOne({ ...scope(domainId, tid), uid, attend: 1 },
        { projection: timeProjection }) as ContestStatusDoc : undefined;
    if (uid && !status) return undefined;
    const endAt = deadlineOf(tdoc, status);
    if (endAt.getTime() > Date.now()) return endAt;
    // If a personal deadline coincides with the global finish, send only the global announcement.
    const globalEnd = tdoc.endAt.getTime() <= Date.now();
    const statuses = globalEnd || !uid
        ? await document.collStatus.find({ ...scope(domainId, tid), attend: 1 }).project({ uid: 1, members: 1 }).toArray()
        : [status];
    const kind = globalEnd || !uid ? 'contest-ended' : status.members?.length ? 'team-ended' : 'participation-ended';
    const deadline = globalEnd ? tdoc.endAt : endAt;
    const recipients = statuses.flatMap((entry) => entry.members?.length ? entry.members : [entry.uid]);
    if (!recipients.length) return undefined;
    await announcements.publish({
        domainId, tid, title: tdoc.title, kind, endAt: deadline, proctorEnabled: !!tdoc.proctorEnabled, createdBy: 0,
        content: kind === 'contest-ended' ? 'The contest has ended. Contest submissions are now closed.'
            : kind === 'team-ended' ? 'The contest has ended for your team. Contest submissions are now closed.'
                : 'Your contest time is up. Contest submissions are now closed.',
        recipients,
        eventKey: `end:${domainId}/${tid}/${globalEnd ? 0 : uid}/${deadline.getTime()}`,
    });
    return undefined;
}

export async function runDue() {
    for (let count = 0; count < 50; count++) {
        const now = new Date();
        const claim = new ObjectId();
        // A renewable schedule and expiring claim survive restarts and multiple backend processes.
        // eslint-disable-next-line no-await-in-loop
        const job = await jobs.findOneAndUpdate({ deadline: { $lte: now }, retryAt: { $lte: now }, lockedUntil: { $lte: now } },
            { $set: { claim, lockedUntil: new Date(now.getTime() + 30_000) } }, { sort: { deadline: 1 }, returnDocument: 'after' });
        if (!job) return;
        try {
            // Always re-read authoritative dates, so editing/extending a contest invalidates stale jobs.
            // eslint-disable-next-line no-await-in-loop
            const next = await notifyEnded(job.domainId, job.tid, job.uid);
            if (next) {
                // eslint-disable-next-line no-await-in-loop
                await jobs.updateOne({ _id: job._id, claim }, { $set: { deadline: next, retryAt: next, lockedUntil: new Date(0) } });
            } else {
                // eslint-disable-next-line no-await-in-loop
                await jobs.deleteOne({ _id: job._id, claim });
            }
        } catch (error) {
            // eslint-disable-next-line no-await-in-loop
            await jobs.updateOne({ _id: job._id, claim }, { $set: { retryAt: new Date(Date.now() + 5000), lockedUntil: new Date(0) } });
            throw error;
        }
    }
}

export async function apply(ctx: Context) {
    await ctx.db.ensureIndexes(jobs, { key: { deadline: 1, retryAt: 1, lockedUntil: 1 }, name: 'due_contest_end_notices' });
    ctx.on('contest/del', (domainId, tid) => jobs.deleteMany({ domainId, tid }));
    ctx.on('domain/delete', (domainId) => jobs.deleteMany({ domainId }));
    // Seed only live/future contests on first deployment, not every historical contest.
    const contests = document.coll.find({ docType: document.TYPE_CONTEST, rule: { $ne: 'homework' }, endAt: { $gte: new Date() } })
        .project(contestProjection);
    for await (const tdoc of contests) await scheduleContest(tdoc as Tdoc);
    if (process.env.CI) return;
    let pending = false;
    ctx.interval(async () => {
        if (pending) return;
        pending = true;
        try {
            await runDue();
        } catch (error) {
            ctx.logger.error('Contest end notification failed:', error);
        } finally {
            pending = false;
        }
    }, 1000);
}
