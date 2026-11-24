export function getLegacyScratchpadCacheKey(
  userId: number | undefined, domainId: string | undefined, pid: string | number, contestId?: string | number,
) {
  return `${userId || 'guest'}/${domainId || ''}/${pid}${contestId ? `@${contestId}` : ''}`;
}

/** Drafts and their reset versions must share the same immutable problem identity. */
export function getScratchpadDraftScope(
  userId: number | undefined, domainId: string | undefined, problemId: unknown, contestId?: string,
) {
  if (!domainId || typeof problemId !== 'string' || !/^[a-f\d]{24}$/i.test(problemId)) return null;
  const id = problemId.toLowerCase();
  const cacheKey = `hydro:editor-draft:v2:${JSON.stringify([userId || 'guest', domainId, id, contestId || ''])}`;
  return { problemId: id, cacheKey, receiptKey: `${cacheKey}#reset` };
}

/** Keep an explicit empty draft so reopening doesn't seed the editor from a submission or template. */
export function clearScratchpadDraft(storage: Pick<Storage, 'setItem'>, key: string) {
  storage.setItem(key, '');
}

export function readDraftResetVersion(storage: Pick<Storage, 'getItem'>, receiptKey: string) {
  const version = Number(storage.getItem(receiptKey));
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}

export function applyDraftReset(storage: Storage, cacheKey: string, receiptKey: string, version: number) {
  if (version <= readDraftResetVersion(storage, receiptKey)) return false;
  clearScratchpadDraft(storage, cacheKey);
  storage.setItem(receiptKey, String(version));
  return true;
}
