import { ObjectId } from 'mongodb';
import {
    ContestModel as contest, ContestNotLiveError, Handler, OplogModel as oplog,
    param, PERM, PermissionError, post, Tdoc, Types, ValidationError,
} from 'hydrooj';
import * as announcements from '../model/announcements';

/** Added to the existing management handler; its normal preparation and permissions still run. */
export class ContestManagementExtras extends Handler {
    tdoc: Tdoc;
    @param('tid', Types.ObjectId)
    @post('content', Types.String)
    async postAnnouncement(domainId: string, tid: ObjectId, content: string) {
        // Never allow request-body/query overrides to borrow management permissions from another domain.
        if (domainId !== this.domain._id) throw new PermissionError(PERM.PERM_EDIT_CONTEST);
        this.checkPerm(PERM.PERM_EDIT_CONTEST);
        if (!contest.isOngoing(this.tdoc)) throw new ContestNotLiveError(domainId, tid);
        if (!content.trim() || content.trim().length > 4000) throw new ValidationError('content');
        await this.limitRate('contest_announcement', 60, 10);
        const statuses = await contest.getMultiStatus(domainId, { docId: tid, attend: 1 }).project({ uid: 1, members: 1 }).toArray();
        this.response.body = await announcements.publish({
            domainId, tid, content, title: this.tdoc.title, createdBy: this.user._id,
            recipients: statuses.flatMap((status) => status.members?.length ? status.members : [status.uid]),
        });
        await oplog.log(this, 'contest.announcement', { tid });
    }
}
