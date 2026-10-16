import { randomInt } from 'node:crypto';
import type { Collection } from 'mongodb';
import {
    InvalidJoinInvitationCodeError, PermissionError, SystemError, TeamAlreadyJoinedError, TeamCaptainRequiredError, TeamMemberLimitError,
    TeamMembershipRequiredError, ValidationError,
} from '../error';
import type { VUdoc } from '../interface';
import { PERM } from '../model/builtin';
import { requireTeamCaptain, teamCaptainGuard, teamCaptainId, teamDomainQuery } from './team-permissions';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export function generateTeamInvitationCode() {
    return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

export function normalizeTeamInvitationCode(value: string) {
    const code = value.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) throw new InvalidJoinInvitationCodeError();
    return code;
}

/** A private field keeps invitation secrets out of public user/scoreboard serialization. */
export async function ensureTeamInvitationCode(
    collection: Collection<VUdoc>, vuid: number, uid: number, reset = false,
    generate = generateTeamInvitationCode,
    domainId = 'system',
) {
    const scope = teamDomainQuery(domainId);
    for (let attempt = 0; attempt < 32; attempt++) {
        // eslint-disable-next-line no-await-in-loop
        const team = await collection.findOne({ ...scope, _id: vuid, members: uid });
        if (!team) throw new TeamMembershipRequiredError();
        if (reset) requireTeamCaptain(team, uid);
        if (!reset && CODE_PATTERN.test(team._teamJoinCode || '')) return team;
        const captainId = teamCaptainId(team);
        if (!captainId || !team.members.includes(captainId)) throw new TeamCaptainRequiredError();
        const code = generate();
        if (code === team._teamJoinCode) continue;
        try {
            // Compare-and-set handles concurrent migration/reset without replacing another request's code.
            // eslint-disable-next-line no-await-in-loop
            const updated = await collection.findOneAndUpdate({
                ...scope, _id: vuid, members: uid,
                ...teamCaptainGuard(team),
                _teamJoinCode: team._teamJoinCode ?? null,
            }, { $set: { _teamJoinCode: code, captainId }, $unset: { invite: '' } }, { returnDocument: 'after' });
            if (updated) return updated;
        } catch (error) {
            if (error?.code !== 11000) throw error;
        }
    }
    throw new SystemError('Could not generate a unique team invitation code');
}

export async function joinTeamByInvitationCode(collection: Collection<VUdoc>, value: string, uid: number, limit: number, domainId = 'system') {
    if (!Number.isSafeInteger(uid) || uid <= 0) throw new PermissionError(PERM.PERM_ATTEND_CONTEST);
    const code = normalizeTeamInvitationCode(value);
    const maxMembers = limit ?? 5;
    if (!Number.isSafeInteger(maxMembers) || maxMembers <= 0) throw new ValidationError('limit.team_members');
    const scope = teamDomainQuery(domainId);
    const current = await collection.findOne({ ...scope, _teamJoinCode: code });
    if (!current) throw new InvalidJoinInvitationCodeError();
    const captainId = teamCaptainId(current);
    if (!captainId || !current.members?.includes(captainId)) throw new TeamCaptainRequiredError();
    // Code validity, membership and the capacity check are part of the same atomic write.
    const updated = await collection.findOneAndUpdate({
        _teamJoinCode: code,
        ...scope,
        _id: current._id,
        ...teamCaptainGuard(current),
        members: { $all: [captainId], $ne: uid },
        $expr: { $lt: [{ $size: { $ifNull: ['$members', []] } }, maxMembers] },
    }, { $addToSet: { members: uid }, $unset: { invite: '' } }, { returnDocument: 'after' });
    if (updated) return updated;
    const team = await collection.findOne({ ...scope, _teamJoinCode: code });
    if (!team) throw new InvalidJoinInvitationCodeError();
    if (team.members?.includes(uid)) throw new TeamAlreadyJoinedError();
    throw new TeamMemberLimitError(maxMembers);
}
