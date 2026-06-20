import { useSessionStore } from '@/stores/session';

// Hydro global privilege constants.
export const PRIV = {
  PRIV_NONE: 0,
  PRIV_MOD_BADGE: 1 << 25,
  PRIV_EDIT_SYSTEM: 1 << 0,
  PRIV_SET_PERM: 1 << 1,
  PRIV_USER_PROFILE: 1 << 2,
  PRIV_REGISTER_USER: 1 << 3,
  PRIV_READ_PROBLEM_DATA: 1 << 4,
  PRIV_READ_RECORD_CODE: 1 << 7,
  PRIV_VIEW_HIDDEN_RECORD: 1 << 8,
  PRIV_JUDGE: 1 << 9,
  PRIV_CREATE_DOMAIN: 1 << 10,
  PRIV_VIEW_ALL_DOMAIN: 1 << 11,
  PRIV_MANAGE_ALL_DOMAIN: 1 << 12,
  PRIV_REJUDGE: 1 << 13,
  PRIV_VIEW_USER_SECRET: 1 << 14,
  PRIV_VIEW_JUDGE_STATISTICS: 1 << 15,
  PRIV_CREATE_FILE: 1 << 16,
  PRIV_UNLIMITED_QUOTA: 1 << 17,
  PRIV_DELETE_FILE: 1 << 18,
  PRIV_DELETE_DOMAIN: 1 << 19,
  PRIV_NEVER: 1 << 20,
  PRIV_UNLIMITED_ACCESS: 1 << 22,
  PRIV_VIEW_SYSTEM_NOTIFICATION: 1 << 23,
  PRIV_SEND_MESSAGE: 1 << 24,
  PRIV_ALL: -1,
  PRIV_DEFAULT: (1 << 2) + (1 << 16) + (1 << 24),
} as const;

// Hydro domain permission constants.
export const PERM = {
  PERM_NONE: 0n,
  PERM_VIEW: 1n << 0n,
  PERM_EDIT_DOMAIN: 1n << 1n,
  PERM_MOD_BADGE: 1n << 2n,
  PERM_CREATE_PROBLEM: 1n << 4n,
  PERM_EDIT_PROBLEM: 1n << 5n,
  PERM_EDIT_PROBLEM_SELF: 1n << 6n,
  PERM_VIEW_PROBLEM: 1n << 7n,
  PERM_VIEW_PROBLEM_HIDDEN: 1n << 8n,
  PERM_SUBMIT_PROBLEM: 1n << 9n,
  PERM_READ_PROBLEM_DATA: 1n << 10n,
  PERM_READ_RECORD_CODE: 1n << 12n,
  PERM_REJUDGE_PROBLEM: 1n << 13n,
  PERM_REJUDGE: 1n << 14n,
  PERM_VIEW_PROBLEM_SOLUTION: 1n << 15n,
  PERM_CREATE_PROBLEM_SOLUTION: 1n << 16n,
  PERM_VOTE_PROBLEM_SOLUTION: 1n << 17n,
  PERM_EDIT_PROBLEM_SOLUTION: 1n << 18n,
  PERM_EDIT_PROBLEM_SOLUTION_SELF: 1n << 19n,
  PERM_DELETE_PROBLEM_SOLUTION: 1n << 20n,
  PERM_DELETE_PROBLEM_SOLUTION_SELF: 1n << 21n,
  PERM_REPLY_PROBLEM_SOLUTION: 1n << 22n,
  PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF: 1n << 24n,
  PERM_DELETE_PROBLEM_SOLUTION_REPLY: 1n << 25n,
  PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF: 1n << 26n,
  PERM_VIEW_DISCUSSION: 1n << 27n,
  PERM_CREATE_DISCUSSION: 1n << 28n,
  PERM_HIGHLIGHT_DISCUSSION: 1n << 29n,
  PERM_EDIT_DISCUSSION: 1n << 30n,
  PERM_EDIT_DISCUSSION_SELF: 1n << 31n,
  PERM_DELETE_DISCUSSION: 1n << 32n,
  PERM_DELETE_DISCUSSION_SELF: 1n << 33n,
  PERM_REPLY_DISCUSSION: 1n << 34n,
  PERM_EDIT_DISCUSSION_REPLY_SELF: 1n << 36n,
  PERM_DELETE_DISCUSSION_REPLY: 1n << 38n,
  PERM_DELETE_DISCUSSION_REPLY_SELF: 1n << 39n,
  PERM_DELETE_DISCUSSION_REPLY_SELF_DISCUSSION: 1n << 40n,
  PERM_VIEW_CONTEST: 1n << 41n,
  PERM_VIEW_CONTEST_SCOREBOARD: 1n << 42n,
  PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD: 1n << 43n,
  PERM_CREATE_CONTEST: 1n << 44n,
  PERM_ATTEND_CONTEST: 1n << 45n,
  PERM_VIEW_TRAINING: 1n << 46n,
  PERM_CREATE_TRAINING: 1n << 47n,
  PERM_EDIT_TRAINING: 1n << 48n,
  PERM_EDIT_TRAINING_SELF: 1n << 49n,
  PERM_EDIT_CONTEST: 1n << 50n,
  PERM_EDIT_CONTEST_SELF: 1n << 51n,
  PERM_VIEW_HOMEWORK: 1n << 52n,
  PERM_VIEW_HOMEWORK_SCOREBOARD: 1n << 53n,
  PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD: 1n << 54n,
  PERM_CREATE_HOMEWORK: 1n << 55n,
  PERM_ATTEND_HOMEWORK: 1n << 56n,
  PERM_EDIT_HOMEWORK: 1n << 57n,
  PERM_EDIT_HOMEWORK_SELF: 1n << 58n,
  PERM_VIEW_RANKING: 1n << 59n,
  PERM_NEVER: 1n << 60n,
  PERM_PIN_DISCUSSION: 1n << 61n,
  PERM_ADD_REACTION: 1n << 62n,
  PERM_PIN_TRAINING: 1n << 63n,
  PERM_LOCK_DISCUSSION: 1n << 64n,
  PERM_VIEW_PROBLEM_SOLUTION_ACCEPT: 1n << 65n,
  PERM_READ_RECORD_CODE_ACCEPT: 1n << 66n,
  PERM_VIEW_USER_PRIVATE_INFO: 1n << 67n,
  PERM_VIEW_DISPLAYNAME: 1n << 67n,
  PERM_VIEW_HIDDEN_CONTEST: 1n << 68n,
  PERM_VIEW_HIDDEN_HOMEWORK: 1n << 69n,
  PERM_VIEW_RECORD: 1n << 70n,
  PERM_ALL: -1n,
} as const;

export function useHasPriv(priv: number | bigint): boolean {
  const userPriv = useSessionStore((s) => s.user.priv);
  if (typeof priv === 'bigint') {
    return (BigInt(userPriv) & priv) === priv;
  }
  return (userPriv & priv) === priv;
}

export function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    try {
      return BigInt(value.endsWith('n') ? value.slice(0, -1) : value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function hasPermValue(value: unknown, perm: bigint): boolean {
  return (toBigInt(value) & perm) === perm;
}

export function useHasPerm(perm: bigint): boolean {
  const userPerm = useSessionStore((s) => s.user.perm);
  return hasPermValue(userPerm, perm);
}

export function usePermission() {
  const user = useSessionStore((s) => s.user);

  const hasPriv = (priv: number | bigint): boolean => {
    if (typeof priv === 'bigint') {
      return (BigInt(user.priv) & priv) === priv;
    }
    return (user.priv & priv) === priv;
  };

  const hasPerm = (perm: bigint): boolean => {
    return hasPermValue(user.perm, perm);
  };

  return { hasPriv, hasPerm, priv: user.priv, perm: user.perm };
}
