export function formatRequestError(error: any, fallback = 'Operation failed'): string {
  if (error?.name === 'ForbiddenError' && error.params?.length === 1 && typeof error.params[0] === 'string') return error.params[0];
  let message = error?.message || fallback;
  for (const [index, value] of (error?.params || []).entries()) message = message.replaceAll(`{${index}}`, String(value));
  return message;
}

/** Handle sudo redirects consistently for settings, paginated logs and binary downloads. */
export function followSafeRedirect(data: any) {
  const redirect = data?.url || data?.redirect;
  if (!redirect) return;
  if (typeof redirect !== 'string' || redirect.includes('\\')) throw new Error('Invalid authorization destination.');
  const target = new URL(redirect, window.location.origin);
  if (target.origin !== window.location.origin || !['https:', 'http:'].includes(target.protocol)) {
    throw new Error('Invalid authorization destination.');
  }
  window.location.assign(target.href);
  throw new Error('Authorization required.');
}

export async function postJsonRequest(url: string, body: Record<string, unknown>, formatError: (error: any) => string = formatRequestError) {
  const response = await fetch(url, { method: 'POST', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Operation failed');
  if (!response.ok || data.error) {
    throw new Error(formatError(data.error));
  }
  // Hydro serializes response.redirect as `url`, including requireSudo responses.
  followSafeRedirect(data);
  return data;
}
