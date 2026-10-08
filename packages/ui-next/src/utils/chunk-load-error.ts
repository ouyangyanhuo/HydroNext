const LOAD_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk .+ failed/i,
  /Unable to preload CSS for/i,
];

/** Only asset-loader failures get a reload action; application bugs stay visible. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { message, name } = error as { message?: unknown, name?: unknown };
  return name === 'ChunkLoadError' || (typeof message === 'string' && LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(message)));
}
