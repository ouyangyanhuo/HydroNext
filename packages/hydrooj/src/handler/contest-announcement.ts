import { Context } from '../context';
import { ForbiddenError } from '../error';
import { PRIV } from '../model/builtin';
import * as announcements from '../model/contest-announcement';
import { ConnectionHandler } from '../service/server';

export class ContestAnnouncementConnectionHandler extends ConnectionHandler {
    noCheckPermView = true;
    private queue: Promise<void> = Promise.resolve();
    private closed = false;

    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        const origin = this.request.headers.origin;
        if (origin && !this.context.cors && new URL(origin).host !== this.request.host) throw new ForbiddenError();
        this.ctx.on('contest/announcement', (recipients) => this.announcement(recipients));
        await this.refresh();
    }

    private refresh(id?: string) {
        // Serialize live updates and confirmations so an older snapshot cannot restore a dismissed alert.
        this.queue = this.queue.catch(() => {}).then(async () => {
            if (this.closed) return;
            if (id) await announcements.acknowledge(this.user._id, id);
            const pending = await announcements.pending(this.user._id);
            if (!this.closed) this.send({ announcements: pending });
        });
        return this.queue;
    }

    async message(payload: { operation?: string, id?: string }) {
        if (payload?.operation !== 'acknowledge' || typeof payload.id !== 'string') return;
        try {
            await this.limitRate('contest_announcement_ack', 60, 100);
            await this.refresh(payload.id);
        } catch (error) {
            if (!this.closed) this.send({ error: { name: error.name, params: error.params || [] } });
        }
    }

    async announcement(recipients: number[]) {
        if (recipients.includes(this.user._id)) await this.refresh();
    }

    async cleanup() {
        this.closed = true;
    }
}

export function apply(ctx: Context) {
    ctx.Connection('contest_announcements_conn', '/contest-announcements-conn', ContestAnnouncementConnectionHandler);
}
