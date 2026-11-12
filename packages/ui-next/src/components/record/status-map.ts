import type { CSSProperties } from 'react';

// Hydro STATUS constants (matching @hydrooj/common/status.ts)
export enum STATUS {
  STATUS_WAITING = 0,
  STATUS_ACCEPTED = 1,
  STATUS_WRONG_ANSWER = 2,
  STATUS_TIME_LIMIT_EXCEEDED = 3,
  STATUS_MEMORY_LIMIT_EXCEEDED = 4,
  STATUS_OUTPUT_LIMIT_EXCEEDED = 5,
  STATUS_RUNTIME_ERROR = 6,
  STATUS_COMPILE_ERROR = 7,
  STATUS_SYSTEM_ERROR = 8,
  STATUS_CANCELED = 9,
  STATUS_ETC = 10,
  STATUS_HACKED = 11,
  STATUS_JUDGING = 20,
  STATUS_COMPILING = 21,
  STATUS_FETCHED = 22,
  STATUS_IGNORED = 30,
  STATUS_FORMAT_ERROR = 31,
  STATUS_HACK_SUCCESSFUL = 32,
  STATUS_HACK_UNSUCCESSFUL = 33,
}

export const STATUS_TEXTS: Record<number, string> = {
  [STATUS.STATUS_WAITING]: 'Waiting',
  [STATUS.STATUS_ACCEPTED]: 'Accepted',
  [STATUS.STATUS_WRONG_ANSWER]: 'Wrong Answer',
  [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'Time Limit Exceeded',
  [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'Memory Limit Exceeded',
  [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'Output Limit Exceeded',
  [STATUS.STATUS_RUNTIME_ERROR]: 'Runtime Error',
  [STATUS.STATUS_COMPILE_ERROR]: 'Compile Error',
  [STATUS.STATUS_SYSTEM_ERROR]: 'System Error',
  [STATUS.STATUS_CANCELED]: 'Canceled',
  [STATUS.STATUS_ETC]: 'Unknown Error',
  [STATUS.STATUS_HACKED]: 'Hacked',
  [STATUS.STATUS_JUDGING]: 'Judging',
  [STATUS.STATUS_COMPILING]: 'Compiling',
  [STATUS.STATUS_FETCHED]: 'Fetched',
  [STATUS.STATUS_IGNORED]: 'Ignored',
  [STATUS.STATUS_FORMAT_ERROR]: 'Format Error',
  [STATUS.STATUS_HACK_SUCCESSFUL]: 'Hack Successful',
  [STATUS.STATUS_HACK_UNSUCCESSFUL]: 'Hack Unsuccessful',
};

/** Judge colour families; each maps to the --hydro-judge-<tone> token set. */
export type JudgeTone = 'ac' | 'wa' | 'tle' | 'pending' | 'waiting' | 'neutral';

export const STATUS_TONES: Record<number, JudgeTone> = {
  [STATUS.STATUS_WAITING]: 'waiting',
  [STATUS.STATUS_ACCEPTED]: 'ac',
  [STATUS.STATUS_WRONG_ANSWER]: 'wa',
  [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'tle',
  [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'tle',
  [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: 'tle',
  [STATUS.STATUS_RUNTIME_ERROR]: 'wa',
  [STATUS.STATUS_COMPILE_ERROR]: 'wa',
  [STATUS.STATUS_SYSTEM_ERROR]: 'wa',
  [STATUS.STATUS_CANCELED]: 'neutral',
  [STATUS.STATUS_ETC]: 'wa',
  [STATUS.STATUS_HACKED]: 'wa',
  [STATUS.STATUS_JUDGING]: 'pending',
  [STATUS.STATUS_COMPILING]: 'pending',
  [STATUS.STATUS_FETCHED]: 'pending',
  [STATUS.STATUS_IGNORED]: 'neutral',
  [STATUS.STATUS_FORMAT_ERROR]: 'wa',
  [STATUS.STATUS_HACK_SUCCESSFUL]: 'ac',
  [STATUS.STATUS_HACK_UNSUCCESSFUL]: 'neutral',
};

export function getStatusTone(status?: number | null): JudgeTone {
  return status == null ? 'neutral' : STATUS_TONES[status] ?? 'neutral';
}

/** Full marks read as accepted, partial credit as a limit verdict, zero as neutral. */
export function getScoreTone(score: unknown): JudgeTone | undefined {
  const value = Number(score);
  if (score == null || score === '' || !Number.isFinite(value)) return undefined;
  if (value >= 100) return 'ac';
  if (value > 0) return 'tle';
  return 'neutral';
}

/** Mantine Badge colours; the style prop overrides the variables Mantine resolves from `color`. */
export function judgeBadgeStyle(tone: JudgeTone): CSSProperties {
  return {
    '--badge-bg': `var(--hydro-judge-${tone}-soft)`,
    '--badge-color': `var(--hydro-judge-${tone}-text)`,
  } as CSSProperties;
}
