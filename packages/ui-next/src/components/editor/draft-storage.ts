export function getScratchpadCacheKey(
  userId: number | undefined, domainId: string | undefined, pid: string | number, contestId?: string | number,
) {
  return `${userId || 'guest'}/${domainId || ''}/${pid}${contestId ? `@${contestId}` : ''}`;
}

/** Keep an explicit empty draft so reopening doesn't seed the editor from a submission or template. */
export function clearScratchpadDraft(storage: Pick<Storage, 'setItem'>, key: string) {
  storage.setItem(key, '');
}

export function getDraftResetReceiptKey(cacheKey: string, problemId: string) {
  return `hydro:editor-draft-reset:v1:${problemId}/${cacheKey}`;
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
