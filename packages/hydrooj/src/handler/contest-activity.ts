import { randomBytes } from 'crypto';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { ForbiddenError, PermissionError } from '../error';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import * as activity from '../model/contest-activity';
import { ConnectionHandler, param, Types } from '../service/server';

export class ContestActivityConnectionHandler extends ConnectionHandler {
    private token = randomBytes(16).toString('hex');
    private tid: ObjectId;
    private pid: number;
    private domainId: string;
    private queue: Promise<void> = Promise.resolve();
    private closed = false;

    @param('tid', Types.ObjectId)
    @param('pid', Types.PositiveInt)
    async prepare(domainId: string, tid: ObjectId, pid: number) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        this.checkPerm(PERM.PERM_VIEW_CONTEST);
        if (domainId !== this.domain._id) throw new PermissionError(PERM.PERM_VIEW_CONTEST);
        const origin = this.request.headers.origin;
        if (origin && !this.context.cors && new URL(origin).host !== this.request.host) throw new ForbiddenError();
        this.domainId = domainId;
        this.tid = tid;
        this.pid = pid;
        // Validate enrollment and problem membership before accepting activity.
        const tdoc = await contest.get(domainId, tid);
        const status = await activity.heartbeat(domainId, tdoc, this.user._id, this.token, pid, false);
        this.send({ ready: true, elapsed: status.problemTimes?.[pid] || 0 });
    }

    async message(payload: { active?: boolean }) {
        if (this.closed || typeof payload?.active !== 'boolean') return;
        this.queue = this.queue.catch(() => {}).then(async () => {
            if (this.closed) return;
            await this.limitRate('contest_activity', 60, 30);
            const tdoc = await contest.get(this.domainId, this.tid);
            const status = await activity.heartbeat(this.domainId, tdoc, this.user._id, this.token, this.pid, payload.active!);
            if (!this.closed) this.send({ elapsed: status.problemTimes?.[this.pid] || 0, total: status.totalProblemTime || 0 });
        });
        try {
            await this.queue;
        } catch (error) {
            if (!this.closed) this.send({ error: { name: error.name, params: error.params || [] } });
        }
    }

    async cleanup() {
        this.closed = true;
        await this.queue.catch(() => {});
        if (!this.tid) return;
        const tdoc = await contest.get(this.domainId, this.tid);
        await activity.heartbeat(this.domainId, tdoc, this.user._id, this.token, this.pid, false);
    }
}

export function apply(ctx: Context) {
    ctx.Connection('contest_activity_conn', '/contest/:tid/activity-conn', ContestActivityConnectionHandler);
}
