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

export interface CategorySlot { top: number, height: number }

/** Cached slot geometry avoids hit-testing rows that are moving out of the way. */
export function trainingCategoryDropIndex(slots: CategorySlot[], source: number, center: number, previous: number) {
  const others = slots.filter((_, index) => index !== source);
  let target = 0;
  while (target < others.length && center > others[target].top + others[target].height / 2) target++;
  // A small dead zone prevents pointer jitter from repeatedly swapping adjacent slots.
  if (target > previous && center < others[previous].top + others[previous].height / 2 + 4) return previous;
  if (target < previous && center > others[previous - 1].top + others[previous - 1].height / 2 - 4) return previous;
  return target;
}

/** Pixels per second, so edge scrolling does not depend on pointer event frequency. */
export function trainingCategoryScrollSpeed(y: number, top: number, bottom: number) {
  if (bottom <= top) return 0;
  const edge = Math.min(48, (bottom - top) / 3);
  if (y < top + edge) return -720 * Math.min(1, Math.max(0, (top + edge - y) / edge));
  if (y > bottom - edge) return 720 * Math.min(1, Math.max(0, (y - bottom + edge) / edge));
  return 0;
}
