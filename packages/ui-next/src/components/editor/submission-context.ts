/** Both submit and replay must use route/document IDs, never a problem's display PID. */
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
