import { escapeRegExp } from 'lodash';
import type { Collection, Filter } from 'mongodb';
import { TeamCaptainLeaveError, TeamCaptainRequiredError, TeamMembershipRequiredError, TeamNameAlreadyExistsError, ValidationError } from '../error';
import type { VUdoc } from '../interface';

/** Unscoped legacy teams are isolated to the main domain, never claimed by a visitor. */
export function teamDomainQuery(domainId: string): Filter<VUdoc> {
    return { domainId: domainId === 'system' ? { $in: ['system', null] } : domainId, disbandedAt: { $exists: false } };
}

/** Legacy team names encode the creator; never infer authority from member ordering. */
export function teamCaptainId(team: Pick<VUdoc, 'uname' | 'captainId'>): number {
    const value = team.captainId === undefined ? Number(team.uname?.match(/^team:(\d+):/)?.[1]) : team.captainId;
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function teamCaptainGuard(team: VUdoc): Filter<VUdoc> {
    return team.captainId === undefined
        ? { captainId: { $exists: false }, uname: team.uname }
        : { captainId: team.captainId };
}

export function requireTeamCaptain(team: VUdoc, uid: number) {
    if (!team?.members?.includes(uid)) throw new TeamMembershipRequiredError();
    if (teamCaptainId(team) !== uid) throw new TeamCaptainRequiredError();
}

/** 调用方持有域成员锁；创建、队长改名与管理员改名共用校验，兼容未建立名称索引的旧队伍。 */
export async function availableTeamName(collection: Collection<VUdoc>, domainId: string, name: string, exceptId?: number) {
    const displayName = name.trim();
    if (!displayName || displayName.length > 80) throw new ValidationError('name');
    const existing = await collection.findOne({
        ...teamDomainQuery(domainId), members: { $exists: true },
        // 忽略首尾空白和字母大小写，正则元字符只按队名原文匹配。
        displayName: { $regex: `^\\s*${escapeRegExp(displayName)}\\s*$`, $options: 'i' },
        ...(exceptId === undefined ? {} : { _id: { $ne: exceptId } }),
    });
    if (existing) throw new TeamNameAlreadyExistsError(displayName);
    return displayName;
}

export async function renameTeamByCaptain(collection: Collection<VUdoc>, vuid: number, uid: number, name: string, domainId = 'system') {
    const scope = teamDomainQuery(domainId);
    const team = await collection.findOne({ ...scope, _id: vuid });
    requireTeamCaptain(team, uid);
    const displayName = await availableTeamName(collection, domainId, name, vuid);
    const updated = await collection.findOneAndUpdate({
        ...scope, _id: vuid, members: uid, ...teamCaptainGuard(team),
    }, { $set: { displayName, captainId: uid } }, { returnDocument: 'after' });
    if (!updated) throw new TeamCaptainRequiredError();
    return updated;
}

export async function leaveOrRemoveTeamMember(collection: Collection<VUdoc>, vuid: number, uid: number, target = uid, domainId = 'system') {
    const scope = teamDomainQuery(domainId);
    const team = await collection.findOne({ ...scope, _id: vuid });
    if (!team?.members?.includes(uid)) throw new TeamMembershipRequiredError();
    const captain = teamCaptainId(team);
    if (target !== uid) {
        requireTeamCaptain(team, uid);
        if (target === captain) throw new TeamCaptainRequiredError();
    } else if (uid === captain && team.members.length > 1) {
        throw new TeamCaptainLeaveError();
    }
    if (!team.members.includes(target)) throw new ValidationError('uid');
    const closing = target === uid && team.members.length === 1;
    const updated = await collection.findOneAndUpdate({
        _id: vuid,
        ...scope,
        ...teamCaptainGuard(team),
        // An exact array match makes closing atomic with concurrent code joins.
        members: closing ? [uid] : { $all: [uid, target] },
    }, [
        { $set: {
            members: { $filter: { input: '$members', as: 'member', cond: { $ne: ['$$member', target] } } },
            ...(closing ? { disbandedAt: new Date() } : {}),
        } },
        ...closing ? [{ $unset: ['_teamJoinCode', 'invite'] }] : [],
    ], { returnDocument: 'after' });
    if (!updated) throw new TeamMembershipRequiredError();
    return updated;
}
