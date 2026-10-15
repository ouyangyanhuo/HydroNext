import type { Collection, Filter } from 'mongodb';
import { TeamCaptainLeaveError, TeamCaptainRequiredError, TeamMembershipRequiredError, ValidationError } from '../error';
import type { VUdoc } from '../interface';

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

export async function renameTeamByCaptain(collection: Collection<VUdoc>, vuid: number, uid: number, name: string) {
    const team = await collection.findOne({ _id: vuid });
    requireTeamCaptain(team, uid);
    const displayName = name.trim();
    if (!displayName) throw new ValidationError('name');
    const updated = await collection.findOneAndUpdate({
        _id: vuid, members: uid, ...teamCaptainGuard(team),
    }, { $set: { displayName, captainId: uid } }, { returnDocument: 'after' });
    if (!updated) throw new TeamCaptainRequiredError();
    return updated;
}

export async function leaveOrRemoveTeamMember(collection: Collection<VUdoc>, vuid: number, uid: number, target = uid) {
    const team = await collection.findOne({ _id: vuid });
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
        ...teamCaptainGuard(team),
        // An exact array match makes closing atomic with concurrent code joins.
        members: closing ? [uid] : { $all: [uid, target] },
    }, [
        { $set: { members: { $filter: { input: '$members', as: 'member', cond: { $ne: ['$$member', target] } } } } },
        ...closing ? [{ $unset: ['_teamJoinCode', 'invite'] }] : [],
    ], { returnDocument: 'after' });
    if (!updated) throw new TeamMembershipRequiredError();
    return updated;
}
