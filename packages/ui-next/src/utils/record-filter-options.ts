import { formatUserName } from './user-name';

export type RecordFilterKind = 'user' | 'problem' | 'contest';
export interface RecordFilterOption { value: string, label: string }

export function recordFilterOptions(kind: RecordFilterKind, documents: any[]): RecordFilterOption[] {
  const options = new Map<string, RecordFilterOption>();
  for (const document of documents) {
    const id = kind === 'user' ? document?._id : document?.docId;
    if (id == null) continue;
    const value = String(id);
    const label = kind === 'user' ? `${formatUserName(document)} · UID ${value}`
      : kind === 'problem' ? `${document.pid || value} · ${document.title || value}`
        : String(document.title || '—');
    options.set(value, { value, label });
  }
  return [...options.values()];
}

type BuildUrl = (name: string, params?: Record<string, string>, query?: Record<string, string>) => string;
const SEARCH_UNAVAILABLE = 'Record filter search is unavailable. Update or restart the backend, then refresh this page.';

export async function searchRecordFilterOptions(
  kind: RecordFilterKind, query: string, domainId: string, buildUrl: BuildUrl, signal: AbortSignal,
  tid = '', exact = false,
): Promise<RecordFilterOption[]> {
  const keyword = query.trim().slice(0, 200);
  const url = buildUrl('record_filter_options', { domainId }, {
    kind, q: keyword, ...(kind !== 'contest' && tid ? { tid } : {}), ...(exact ? { exact: 'true' } : {}),
  });
  // An old server/route map returns "#" for unknown routes. Never fetch the current page as an API.
  if (!url || url.startsWith('#')) throw new Error(SEARCH_UNAVAILABLE);
  const response = await fetch(url, {
    signal, cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' },
  });
  const data = await response.json();
  if (!response.ok || data?.error) throw data?.error || new Error(response.statusText || 'Failed');
  const { documents } = data;
  if (!Array.isArray(documents)) throw new Error(SEARCH_UNAVAILABLE);
  return recordFilterOptions(kind, documents.slice(0, 20));
}
