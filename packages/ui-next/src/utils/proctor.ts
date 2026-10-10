export interface ProctorSubmission {
  pid: number;
  lang: string;
  code: string;
  pretest: boolean;
  input: string[];
  fileHash: string;
}

export function proctorAccessRequest(url: string, origin: string) {
  const target = new URL(url, origin);
  if (target.origin !== origin) return null;
  const problem = target.pathname.match(/^\/(?:d\/[^/]+\/)?p\/([^/]+)(?:\/submit|\/file\/.+)?$/);
  if (problem) {
    const tids = target.searchParams.getAll('tid');
    if (tids.length !== 1 || !/^[a-f0-9]{24}$/i.test(tids[0])) return null;
    let pid: string;
    try {
      pid = decodeURIComponent(problem[1]);
    } catch {
      return null;
    }
    if (Number.isSafeInteger(+pid)) pid = String(+pid);
    return { action: 'problem_view', method: 'GET', path: target.pathname, payload: { tid: tids[0].toLowerCase(), pid } };
  }
  const contest = target.pathname.match(
    /^\/(?:d\/[^/]+\/)?contest\/([a-f0-9]{24})\/(?:problems|print|api\/printing\/team|file\/private\/.+)$/i,
  );
  if (!contest) return null;
  return { action: 'contest_view', method: 'GET', path: target.pathname, payload: { tid: contest[1].toLowerCase() } };
}

/** Optional on ordinary pages; protected routes still fail closed at the server. */
export async function proctorAccessHeaders(url: string): Promise<Record<string, string>> {
  const request = proctorAccessRequest(url, window.location.origin);
  const bridge = (window as any).examAPI?.proctorHeaders;
  if (!request || typeof bridge !== 'function') return {};
  const headers = await bridge(request);
  if (typeof headers?.['x-proctor-token'] !== 'string' || typeof headers?.['x-proctor-proof'] !== 'string') {
    throw new TypeError('Proctor authentication required.');
  }
  return { 'x-proctor-token': headers['x-proctor-token'], 'x-proctor-proof': headers['x-proctor-proof'] };
}

export async function proctorSubmissionHeaders(enabled: boolean, url: string, payload: ProctorSubmission): Promise<Record<string, string>> {
  if (!enabled) return {};
  const bridge = (window as any).examAPI?.proctorHeaders;
  if (typeof bridge !== 'function') throw new Error('Use an up-to-date proctor client to submit.');
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin) throw new Error('Invalid proctor request origin.');
  const headers = await bridge({ action: 'submit', method: 'POST', path: target.pathname, payload });
  if (typeof headers?.['x-proctor-token'] !== 'string' || typeof headers?.['x-proctor-proof'] !== 'string') {
    throw new TypeError('Proctor authentication required.');
  }
  return { 'x-proctor-token': headers['x-proctor-token'], 'x-proctor-proof': headers['x-proctor-proof'] };
}

export function proctorError(error: any, fallback = 'Operation failed'): string {
  if (error?.name === 'ForbiddenError' && error.params?.length === 1 && typeof error.params[0] === 'string') return error.params[0];
  let message = error?.message || fallback;
  for (const [index, value] of (error?.params || []).entries()) message = message.replaceAll(`{${index}}`, String(value));
  return message;
}

export async function proctorRequest(url: string, body: Record<string, unknown>, formatError: (error: any) => string = proctorError) {
  const response = await fetch(url, { method: 'POST', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Operation failed');
  if (!response.ok || data.error) {
    throw new Error(formatError(data.error));
  }
  // Hydro serializes response.redirect as `url`, including requireSudo responses.
  const redirect = data.url || data.redirect;
  if (redirect) {
    if (typeof redirect !== 'string' || redirect.includes('\\')) throw new Error('Invalid authorization destination.');
    const target = new URL(redirect, window.location.origin);
    if (target.origin !== window.location.origin || !['https:', 'http:'].includes(target.protocol)) {
      throw new Error('Invalid authorization destination.');
    }
    window.location.assign(target.href);
    throw new Error('Authorization required.');
  }
  return data;
}
