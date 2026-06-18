import { useSessionStore } from '@/stores/session';

// Hydro permission constants (matching backend PRIV values)
export const PRIV = {
  PRIV_NONE: 0,
  PRIV_USER_PROFILE: 1 << 0,
  PRIV_USER_SETTINGS: 1 << 1,
  PRIV_VIEW_PROBLEM: 1 << 4,
  PRIV_SUBMIT_PROBLEM: 1 << 5,
  PRIV_VIEW_PROBLEM_SOLUTION: 1 << 7,
  PRIV_CREATE_PROBLEM: 1 << 11,
  PRIV_EDIT_PROBLEM: 1 << 12,
  PRIV_VIEW_CONTEST: 1 << 16,
  PRIV_VIEW_CONTEST_SCOREBOARD: 1 << 17,
  PRIV_CREATE_CONTEST: 1 << 22,
  PRIV_EDIT_CONTEST: 1 << 23,
  PRIV_VIEW_DISCUSSION: 1 << 26,
  PRIV_CREATE_DISCUSSION: 1 << 27,
  PRIV_VIEW_RECORD: 1 << 30,
  PRIV_VIEW_JUDGE_STATISTICS: BigInt(1) << BigInt(32),
  PRIV_MANAGE: BigInt(1) << BigInt(48),
  PRIV_JUDGE: BigInt(1) << BigInt(50),
} as const;

export function useHasPriv(priv: number | bigint): boolean {
  const userPriv = useSessionStore((s) => s.user.priv);
  if (typeof priv === 'bigint') {
    return (BigInt(userPriv) & priv) === priv;
  }
  return (userPriv & priv) === priv;
}

export function usePermission() {
  const user = useSessionStore((s) => s.user);

  const hasPriv = (priv: number | bigint): boolean => {
    if (typeof priv === 'bigint') {
      return (BigInt(user.priv) & priv) === priv;
    }
    return (user.priv & priv) === priv;
  };

  return { hasPriv, priv: user.priv };
}
