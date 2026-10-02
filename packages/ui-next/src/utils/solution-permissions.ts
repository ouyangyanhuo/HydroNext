import { PERM } from '@hydrooj/common/permission';
import { toBigInt } from './permissions';

interface SolutionUser {
  _id: number;
  perm?: unknown;
  scope?: unknown;
}

interface OwnedDocument {
  owner?: number;
  maintainer?: number[];
}

/** Mirror ProblemSolutionHandler; the server remains the authorization boundary. */
export function solutionPermissions(user: SolutionUser, doc: OwnedDocument = {}) {
  const permissions = toBigInt(user.perm) & (user.scope == null ? -1n : toBigInt(user.scope));
  const has = (permission: bigint) => user._id > 0 && (permissions & permission) === permission;
  const own = user._id > 0 && (doc.owner === user._id || !!doc.maintainer?.includes(user._id));
  return {
    create: has(PERM.PERM_CREATE_PROBLEM_SOLUTION),
    vote: has(PERM.PERM_VOTE_PROBLEM_SOLUTION),
    reply: has(PERM.PERM_REPLY_PROBLEM_SOLUTION),
    edit: has(own ? PERM.PERM_EDIT_PROBLEM_SOLUTION_SELF : PERM.PERM_EDIT_PROBLEM_SOLUTION),
    delete: has(own ? PERM.PERM_DELETE_PROBLEM_SOLUTION_SELF : PERM.PERM_DELETE_PROBLEM_SOLUTION),
    editReply: own && has(PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF),
    deleteReply: (own && has(PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF)) || has(PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY),
  };
}
