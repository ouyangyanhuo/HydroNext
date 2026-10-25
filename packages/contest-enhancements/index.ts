import { ContestModel, Context, PERM, type Tdoc } from 'hydrooj';
import { apply as registerActivity } from './handler/activity';
import { apply as registerAnnouncements } from './handler/announcements';
import { ContestManagementExtras } from './handler/management';
import { appendContestActivityTimes } from './lib/activity';
import { getTimes } from './model/activity';
import { initialize as initializeAnnouncements } from './model/announcements';
import * as ending from './model/ending';

declare module 'hydrooj' {
    interface EventMap {
        'contest/announcement': (recipients: number[]) => any;
    }
    interface ScoreboardNode { problemTime?: number }
    interface ContestStatusDoc {
        /** Foreground problem-page time in milliseconds, independent of ranking penalties. */
        problemTimes?: Record<number, number>;
        totalProblemTime?: number;
        problemActivityRev?: number;
        problemActivity?: { token: string, pid: number, at: number } | null;
    }
}

export async function apply(ctx: Context) {
    await initializeAnnouncements(ctx);
    await ending.initialize(ctx);
    registerActivity(ctx);
    registerAnnouncements(ctx);
    ctx.withHandlerClass('ContestManagement', (HandlerClass) => {
        const target = HandlerClass.prototype as Partial<ContestManagementExtras>;
        const method = ContestManagementExtras.prototype.postAnnouncement;
        ctx.effect(() => {
            const original = target.postAnnouncement;
            target.postAnnouncement = method;
            return () => {
                if (target.postAnnouncement !== method) return;
                if (original) target.postAnnouncement = original;
                else delete target.postAnnouncement;
            };
        });
    });
    ctx.on('handler/after/ContestManagement#get', (handler) => {
        handler.response.body.canSendAnnouncement = handler.user.hasPerm(PERM.PERM_EDIT_CONTEST) && ContestModel.isOngoing(handler.tdoc);
    });
    ctx.on('handler/after/ContestDetail#post', (handler) => {
        if (handler.args.operation === 'early_end') {
            return ending.notifyEnded(handler.domain._id, handler.tdoc.docId, handler.team ?? handler.user._id);
        }
        return undefined;
    });
    ctx.on('contest/add', (payload, docId, domainId) => ending.scheduleContest({ ...payload, docId, domainId } as Tdoc));
    ctx.on('contest/edit', (tdoc, changes) => {
        if (['beginAt', 'endAt', 'duration', 'rule'].some((key) => key in changes)) return ending.scheduleContest(tdoc);
        return undefined;
    });
    ctx.on('contest/status', (domainId, tid, uid, changes, removed) => {
        if (['startAt', 'endAt'].some((key) => (changes && key in changes) || (removed && key in removed))) {
            return ending.scheduleParticipant(domainId, tid, uid);
        }
        return undefined;
    });
    ctx.on('contest/scoreboard', async (tdoc, rows, _udict, _pdict, config, handler) => {
        if (tdoc.rule === 'homework') return;
        appendContestActivityTimes(rows, await getTimes(tdoc.domainId, tdoc.docId), tdoc.pids, config.isExport, handler.translate.bind(handler));
    });
}
