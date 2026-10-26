import { Context, hashFile, registerContestSecurity } from 'hydrooj';
import { apply as registerRoutes } from './handler';
import { proctorRankingFilter, submissionPayload } from './lib/proctor';
import { requireProctorAccess } from './lib/proctor-access';
import { requireProctorRecordAccess } from './lib/proctor-record-access';
import { teamProctorStatus } from './lib/proctor-team';
import * as proctor from './model/store';

export async function apply(ctx: Context) {
    await proctor.initialize(ctx);
    // Publish authentication capability only after every route is registered.
    registerRoutes(ctx);
    ctx.effect(() => registerContestSecurity({
        resume: proctor.resumeContest,
        checkConfig: proctor.checkContestConfig,
        requireAccess: requireProctorAccess,
        async requireRecordAccess(handler, tdoc, rdoc) {
            const session = await requireProctorRecordAccess(handler, tdoc, rdoc);
            return session ? { assert: () => proctor.assertAccessSession(session) } : undefined;
        },
        async reserveSubmission(handler, tdoc, request) {
            const { pid, lang, code, pretest, input, filePath } = request;
            const session = await proctor.authenticate({ uid: handler.user._id, domainId: handler.domain._id, tid: tdoc.docId },
                handler.request.headers['x-proctor-token'] as string, handler.request.headers['x-proctor-proof'] as string,
                'submit', (handler.context.originalPath || handler.request.path).split('?')[0],
                submissionPayload(pid, lang, code, pretest, input, filePath ? await hashFile(filePath) : ''));
            return proctor.reserveSubmission(session);
        },
        rankingFilter: proctorRankingFilter,
        teamStatus: teamProctorStatus,
    }));
}
