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
        : `${document.title || value} · ${value}`;
    options.set(value, { value, label });
  }
  return [...options.values()];
}

type BuildUrl = (name: string, params?: Record<string, string>, query?: Record<string, string>) => string;

export async function searchRecordFilterOptions(
  kind: RecordFilterKind, query: string, domainId: string, buildUrl: BuildUrl, signal: AbortSignal,
): Promise<RecordFilterOption[]> {
  const keyword = query.trim().slice(0, 200);
  if (kind === 'user' && !keyword) return [];
  let url: string;
  let init: RequestInit = {};
  if (kind === 'user') {
    url = `/d/${encodeURIComponent(domainId)}/api/users`;
    init = {
      method: 'POST',
      body: JSON.stringify({ args: { search: keyword, limit: 10 }, projection: ['_id', 'uname', 'displayName'] }),
      headers: { 'Content-Type': 'application/json' },
    };
  } else if (kind === 'problem') {
    url = buildUrl('problem_main', {}, { q: keyword, quick: 'true', limit: '10', sort: keyword ? 'default' : 'recent' });
  } else {
    url = /^[\da-f]{24}$/i.test(keyword)
      ? buildUrl('contest_detail', { tid: keyword }) : buildUrl('contest_main', {}, { q: keyword });
  }
  const response = await fetch(url, {
    ...init, signal, cache: 'no-store', redirect: 'error',
    headers: { ...init.headers, Accept: 'application/json' },
  });
  const data = await response.json();
  if (!response.ok || data?.error) throw data?.error || new Error(response.statusText || 'Failed');
  const documents = kind === 'user' ? data : kind === 'problem' ? data.pdocs : data.tdocs || (data.tdoc ? [data.tdoc] : []);
  return recordFilterOptions(kind, Array.isArray(documents) ? documents.slice(0, 20) : []);
}
