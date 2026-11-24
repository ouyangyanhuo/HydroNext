import type { ObjectId } from 'mongodb';
import type { Context } from '../context';
import { PERM, PRIV } from '../model/builtin';
import { draftResetScope, getDraftResetVersion } from '../model/editor-draft-reset';
import {
    ConnectionHandler, Handler, param, query, route, Types,
} from '../service/server';

/** These endpoints serve only the current account's reset metadata, never problem content. */
class ProblemDraftResetHandler extends Handler {
    @route('problemId', Types.ObjectId)
    @query('tid', Types.ObjectId, true)
    async get(domainId: string, problemId: ObjectId, tid?: ObjectId) {
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.body = {
            uid: this.user._id, domainId, version: await getDraftResetVersion(domainId, this.user._id, problemId, tid),
        };
    }
}

class ProblemDraftResetConnectionHandler extends ConnectionHandler {
    @param('problemId', Types.ObjectId)
    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, problemId: ObjectId, tid?: ObjectId) {
        const scope = draftResetScope(domainId, this.user._id, problemId, tid);
        // Subscribe before reading the snapshot; duplicate/out-of-order versions are safe.
        this.ctx.on('editor/draftReset', (update) => {
            if (update.uid === scope.uid && update.domainId === scope.domainId
                && update.problemId === scope.problemId && update.tid === scope.tid) this.send(update);
        });
        this.send({ ...scope, version: await getDraftResetVersion(domainId, scope.uid, problemId, tid) });
    }
}

export function apply(ctx: Context) {
    ctx.Route('problem_draft_reset', '/problem/draft-reset/:problemId', ProblemDraftResetHandler, PERM.PERM_VIEW, PRIV.PRIV_USER_PROFILE);
    ctx.Connection('problem_draft_reset_conn', '/problem-draft-reset-conn', ProblemDraftResetConnectionHandler,
        PERM.PERM_VIEW, PRIV.PRIV_USER_PROFILE);
}
