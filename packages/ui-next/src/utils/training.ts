export function formatTrainingDifficulty(problem?: { difficulty?: unknown } | null): string {
  const value = problem?.difficulty;
  if (typeof value !== 'number' && typeof value !== 'string') return '-';
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 10 ? String(level) : '-';
}

export function isTrainingEnrolled(tsdoc: any): boolean {
  const value = tsdoc?.enroll;
  return value === true || value === 1 || value === '1';
}

export function getTrainingViewState(tsdoc: any): 'completed' | 'progress' | 'outside' {
  if (!isTrainingEnrolled(tsdoc)) return 'outside';
  return tsdoc?.done ? 'completed' : 'progress';
}
