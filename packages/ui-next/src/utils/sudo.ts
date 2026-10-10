import { proctorError } from './proctor';

function sudoTarget(value: unknown, currentUrl: string): string {
  if (typeof value !== 'string' || !value || value.includes('\\')) throw new Error('Invalid authorization destination.');
  const current = new URL(currentUrl);
  const target = new URL(value, current);
  if (target.origin !== current.origin || !['https:', 'http:'].includes(target.protocol)) {
    throw new Error('Invalid authorization destination.');
  }
  return target.pathname + target.search + target.hash;
}

/** Resume the exact operation saved by the server, after successful verification. */
export async function completeSudoVerification(data: any, fallback: unknown, currentUrl: string, request: typeof fetch = fetch) {
  const target = sudoTarget(data.url || data.redirect || fallback, currentUrl);
  const method = String(data.method || 'get').toUpperCase();
  if (method === 'GET') return target;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('Invalid authorization destination.');
  const response = await request(target, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(data.args || {}),
  });
  if (response.redirected && response.ok) return sudoTarget(response.url, currentUrl);
  const json = (response.headers.get('content-type') || '').includes('json') ? await response.json() : {};
  if (!response.ok || json.error) throw new Error(proctorError(json.error, 'Operation failed'));
  return sudoTarget(json.url || json.redirect || data.referer || target, currentUrl);
}
