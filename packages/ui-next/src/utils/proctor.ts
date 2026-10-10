export interface ProctorSubmission {
  pid: number;
  lang: string;
  code: string;
  pretest: boolean;
  input: string[];
  fileHash: string;
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
  if (data.redirect) {
    const target = new URL(data.redirect, window.location.origin);
    if (target.origin === window.location.origin) window.location.assign(target.href);
    throw new Error('Authorization required.');
  }
  if (!response.ok || data.error) {
    throw new Error(formatError(data.error));
  }
  return data;
}
