/** Submission payloads and replay use document IDs independently of visible route aliases. */
export function resolveSubmissionContext(
  data: { pdoc?: { docId?: string | number, pid?: string | number }, tdoc?: { docId?: string, _id?: string } },
  search: string,
  fallbackPid: string | number = '',
) {
  return {
    pid: data.pdoc?.docId ?? data.pdoc?.pid ?? fallbackPid,
    tid: data.tdoc?.docId || new URLSearchParams(search).get('tid') || data.tdoc?._id || undefined,
  };
}

/** Keep the visible route alias and domain prefix for the client's exact-path proof. */
export function getProblemSubmitUrl(pathname: string, query: Record<string, string>) {
  const route = pathname.match(/^((?:\/d\/[^/]+)?\/p\/[^/]+)(?:\/submit)?$/)?.[1];
  if (!route) return null;
  const search = new URLSearchParams(query).toString();
  return `${route}/submit${search ? `?${search}` : ''}`;
}
