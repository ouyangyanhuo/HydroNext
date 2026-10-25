export interface ProctorSubmission {
  pid: number;
  lang: string;
  code: string;
  pretest: boolean;
  input: string[];
  fileHash: string;
}

export function canRequestProctorExit(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).examAPI?.requestQuit === 'function';
}

/** 网页仅请求打开客户端确认窗口；封存、上传和回执校验仍由客户端完成。 */
export async function requestProctorExit(): Promise<void> {
  if (!canRequestProctorExit()) throw new Error('Open this page in the proctor client to finish proctoring and upload your log.');
  await (window as any).examAPI.requestQuit();
}

export interface ProctorAccessRequest {
  action: 'problem_view' | 'record_view' | 'contest_view';
  method: 'GET';
  path: string;
  payload: Record<string, string>;
}

const accessResolvers = new Set<(target: URL) => ProctorAccessRequest | null>();

export function registerProctorAccessResolver(resolver: (target: URL) => ProctorAccessRequest | null) {
  accessResolvers.add(resolver);
  return () => { accessResolvers.delete(resolver); };
}

export function proctorAccessRequest(url: string, origin: string): ProctorAccessRequest | null {
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
  const record = target.pathname.match(/^\/(?:d\/[^/]+\/)?record\/([a-f0-9]{24})$/i);
  if (record) return { action: 'record_view', method: 'GET', path: target.pathname, payload: { rid: record[1].toLowerCase() } };
  const contest = target.pathname.match(
    /^\/(?:d\/[^/]+\/)?contest\/([a-f0-9]{24})\/(?:problems|print|api\/printing\/team|file\/private\/.+)$/i,
  );
  if (contest) return { action: 'contest_view', method: 'GET', path: target.pathname, payload: { tid: contest[1].toLowerCase() } };
  for (const resolve of accessResolvers) {
    const request = resolve(target);
    if (request?.method === 'GET' && request.path === target.pathname) return request;
  }
  return null;
}

/** Optional on ordinary pages; protected routes still fail closed at the server. */
export async function proctorAccessHeaders(url: string): Promise<Record<string, string>> {
  const request = proctorAccessRequest(url, window.location.origin);
  const bridge = (window as any).examAPI?.proctorHeaders;
  if (!request || typeof bridge !== 'function') return {};
  const headers = await bridge(request);
  // 未启用监考时原生桥返回空对象；是否需要证明仍由服务端最终决定。
  if (headers && typeof headers === 'object' && !Array.isArray(headers) && Object.keys(headers).length === 0) return {};
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

export {
  followSafeRedirect as followProctorRedirect, formatRequestError as proctorError, postJsonRequest as proctorRequest,
} from './request';
