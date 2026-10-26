import { type ConnectionHandler, type Handler, PERM, ProctorClientRequiredError, type RecordDoc, type Tdoc } from 'hydrooj';
import * as proctor from '../model/store';

/** 记录详情、下载、回放和实时连接共用个人监考验证；比赛管理权限不受影响。 */
export async function requireProctorRecordAccess(handler: Handler | ConnectionHandler, tdoc: Tdoc, rdoc: RecordDoc) {
    if (!tdoc?.proctorEnabled || Date.now() >= tdoc.endAt.getTime()
        || handler.user.own(tdoc) || handler.user.hasPerm(PERM.PERM_EDIT_CONTEST)) return undefined;
    // WebSocket 处理器也继承 response，但升级后不能再通过它写 HTTP 响应头。
    if (!('conn' in handler)) handler.response.addHeader('Cache-Control', 'no-store');
    const token = handler.request.headers['x-proctor-token'];
    const proof = handler.request.headers['x-proctor-proof'];
    if (typeof token !== 'string' || !token || typeof proof !== 'string' || !proof) throw new ProctorClientRequiredError();
    return proctor.authenticateAccess({ uid: handler.user._id, domainId: handler.domain._id, tid: tdoc.docId },
        token, proof, 'record_view', (handler.context.originalPath || handler.request.path).split('?')[0],
        { rid: rdoc._id.toHexString() });
}
