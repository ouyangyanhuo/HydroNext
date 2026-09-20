export function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    try {
      const normalized = value.startsWith('BigInt::') ? value.slice(8) : value;
      return BigInt(normalized.endsWith('n') ? normalized.slice(0, -1) : normalized);
    } catch {
      return 0n;
    }
  }
  return 0n;
}
