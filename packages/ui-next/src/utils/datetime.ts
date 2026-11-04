const SECOND_IN = {
  MINUTE: 60,
  HOUR: 60 * 60,
  DAY: 60 * 60 * 24,
  MONTH: 60 * 60 * 24 * 30,
} as const;

export function formatRelative(
  date: Date,
  t: (key: string) => string,
  locale?: string,
): string {
  const diffMs = Date.now() - date.getTime();
  const absSeconds = Math.floor(Math.abs(diffMs) / 1000);
  const isFuture = diffMs < 0;

  let key = 'just now';
  let value = 0;

  if (absSeconds >= SECOND_IN.MONTH) {
    return date.toLocaleDateString(locale);
  } else if (absSeconds >= SECOND_IN.DAY) {
    value = Math.floor(absSeconds / SECOND_IN.DAY);
    key = isFuture ? 'in {0}d' : '{0}d ago';
  } else if (absSeconds >= SECOND_IN.HOUR) {
    value = Math.floor(absSeconds / SECOND_IN.HOUR);
    key = isFuture ? 'in {0}h' : '{0}h ago';
  } else if (absSeconds >= SECOND_IN.MINUTE) {
    value = Math.floor(absSeconds / SECOND_IN.MINUTE);
    key = isFuture ? 'in {0}m' : '{0}m ago';
  } else if (diffMs < -5000) {
    value = 1;
    key = 'in {0}m';
  }

  return t(key).replace('{0}', String(value));
}
