import { ContestNotLiveError, type Handler, ProctorClientRequiredError, type Tdoc } from 'hydrooj';
import * as proctor from '../model/store';

/** Protect content reads, not just submissions. Management and handshake routes stay separate. */
export async function requireProctorAccess(handler: Handler, tdoc: Tdoc, pid?: string | number) {
    if (!tdoc?.proctorEnabled || Date.now() > tdoc.endAt.getTime()) return;
    handler.response.addHeader('Cache-Control', 'no-store');
    // 赛前令牌仅表示认证通过，不能用它提前读取题目、打印内容或私有附件。
    if (tdoc.beginAt && Date.now() < tdoc.beginAt.getTime()) throw new ContestNotLiveError(tdoc.docId);
    const token = handler.request.headers['x-proctor-token'];
    const proof = handler.request.headers['x-proctor-proof'];
    if (typeof token !== 'string' || !token || typeof proof !== 'string' || !proof) throw new ProctorClientRequiredError();
    const tid = tdoc.docId;
    const payload = pid === undefined ? { tid: tid.toHexString() } : { tid: tid.toHexString(), pid: String(pid) };
    await proctor.authenticateAccess({ uid: handler.user._id, domainId: handler.domain._id, tid }, token, proof,
        pid === undefined ? 'contest_view' : 'problem_view',
        (handler.context.originalPath || handler.request.path).split('?')[0], payload);
}
