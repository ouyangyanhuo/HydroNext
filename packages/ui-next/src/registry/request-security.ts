export interface ProtectedAccessRequest {
  action: 'problem_view' | 'record_view' | 'contest_view';
  method: 'GET';
  path: string;
  payload: Record<string, string>;
}
export interface ProtectedSubmission {
  pid: number;
  lang: string;
  code: string;
  pretest: boolean;
  input: string[];
  fileHash: string;
}
interface RequestSecurity {
  accessHeaders(url: string): Promise<Record<string, string>>;
  submissionHeaders(url: string, payload: ProtectedSubmission): Promise<Record<string, string>>;
  canRetry(url: string): boolean;
}
let provider: RequestSecurity | undefined;
const routes = new Set<(target: URL) => ProtectedAccessRequest | null>();

export function registerProtectedAccessResolver(resolver: (target: URL) => ProtectedAccessRequest | null) {
  routes.add(resolver);
  return () => { routes.delete(resolver); };
}
export function resolveProtectedAccess(target: URL) {
  for (const resolve of routes) {
    const request = resolve(target);
    if (request?.method === 'GET' && request.path === target.pathname) return request;
  }
  return null;
}
export function registerRequestSecurity(value: RequestSecurity) {
  if (provider) throw new Error('Request security provider is already registered.');
  provider = value;
  return () => { if (provider === value) provider = undefined; };
}
export async function protectedAccessHeaders(url: string) {
  return provider ? provider.accessHeaders(url) : {};
}
export async function protectedSubmissionHeaders(required: boolean, url: string, payload: ProtectedSubmission) {
  if (!required) return {};
  if (!provider) throw new Error('Proctor service is unavailable. Contact the administrator.');
  return provider.submissionHeaders(url, payload);
}
export function canRetryProtectedAccess(url: string) { return !!provider?.canRetry(url); }
