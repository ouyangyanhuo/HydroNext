import type { ContestStatusDoc } from 'hydrooj';

/** 全员独立监考：仅当前参赛名单内每人的最终日志都已上传，全队才完成。 */
export function teamProctorStatus(status: Pick<ContestStatusDoc, 'members' | 'proctorMembers'>,
    users: Record<number, { uname?: string, displayName?: string }> = {}) {
    const members = [...new Set(status.members || [])];
    const pending = members.filter((uid) => status.proctorMembers?.[uid]?.proctorLogUploaded !== true)
        .map((uid) => ({ uid, name: users[uid]?.displayName || users[uid]?.uname || String(uid) }));
    return { total: members.length, uploaded: members.length - pending.length, pending };
}
