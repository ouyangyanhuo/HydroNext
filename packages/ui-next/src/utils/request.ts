import { formatErrorMessage } from './error';

export function formatRequestError(error: any, fallback = 'Operation failed'): string {
  if (error?.name === 'ForbiddenError' && error.params?.length === 1 && typeof error.params[0] === 'string') return error.params[0];
  return formatErrorMessage(error, fallback);
}

/** Handle sudo redirects consistently for settings, paginated logs and binary downloads. */
export function followSafeRedirect(data: any, authorizationOnly = false) {
  const redirect = data?.url || data?.redirect;
  if (!redirect) return;
  if (typeof redirect !== 'string' || redirect.includes('\\')) throw new Error('Invalid authorization destination.');
  const target = new URL(redirect, window.location.origin);
  if (target.origin !== window.location.origin || !['https:', 'http:'].includes(target.protocol)) {
    throw new Error('Invalid authorization destination.');
  }
  // Management handlers also return their ordinary `back()` URL after a save.
  // Batches handle that locally and must only navigate away for sudo verification.
  if (authorizationOnly && !/^(?:\/d\/[^/]+)?\/user\/sudo\/?$/.test(target.pathname)) return;
  window.location.assign(target.href);
  throw new Error('Authorization required.');
}

export async function postJsonRequest(url: string, body: Record<string, unknown>, formatError: (error: any) => string = formatRequestError,
  options: { redirects?: 'all' | 'authorization' } = {}) {
  const response = await fetch(url, { method: 'POST', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Operation failed');
  if (!response.ok || data.error) {
    throw new Error(formatError(data.error));
  }
  // Hydro serializes response.redirect as `url`, including requireSudo responses.
  followSafeRedirect(data, options.redirects === 'authorization');
  return data;
}
