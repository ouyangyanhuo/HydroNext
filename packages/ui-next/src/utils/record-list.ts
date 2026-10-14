export function formatScore(score: unknown): string {
  const value = Number(score);
  if (!Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function mergeLiveRecord(
  current: any[],
  record: any,
  options: { matches: boolean, page: number, allowPush: boolean, limit: number },
): any[] {
  const rid = String(record._id);
  const index = current.findIndex((item) => String(item._id) === rid);
  if (!options.matches) {
    return index < 0 ? current : current.filter((_, currentIndex) => currentIndex !== index);
  }
  if (index >= 0) {
    const next = [...current];
    next[index] = { ...next[index], ...record };
    return next;
  }
  if (options.page !== 1 || !options.allowPush) return current;
  return [record, ...current].slice(0, options.limit);
}
