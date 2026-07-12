export function isTrainingEnrolled(tsdoc: any): boolean {
  const value = tsdoc?.enroll;
  return value === true || value === 1 || value === '1';
}

export function getTrainingViewState(tsdoc: any): 'completed' | 'progress' | 'outside' {
  if (!isTrainingEnrolled(tsdoc)) return 'outside';
  return tsdoc?.done ? 'completed' : 'progress';
}
