/** Move the complete category ID rather than editing its contents or memberships. */
export function moveTrainingCategory(ids: string[], from: string, to: string): string[] {
  const source = ids.indexOf(from);
  const target = ids.indexOf(to);
  if (source < 0 || target < 0 || source === target) return ids;
  const next = [...ids];
  next.splice(source, 1);
  next.splice(target, 0, from);
  return next;
}
