import type { IncomingHttpHeaders } from 'http';
import { CsrfTokenError } from './error';

function httpOrigin(value: string, originHeader = false) {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
            || (originHeader && (url.pathname !== '/' || url.search || url.hash))) throw new Error();
        return url.origin;
    } catch {
        throw new CsrfTokenError();
    }
}

/** Prefer an explicitly configured public URL only for its own host, never for unrelated domain hosts. */
export function requestTargetOrigin(protocol: string, host: string, publicUrl = '') {
    const target = new URL(httpOrigin(`${protocol}://${host}`, true));
    if (publicUrl) {
        try {
            const published = new URL(publicUrl);
            // An old HTTP setting must not downgrade a request already identified as HTTPS.
            if (['http:', 'https:'].includes(published.protocol) && !published.username && !published.password
                && (published.protocol === 'https:' || target.protocol !== 'https:')
                && published.host === target.host) return published.origin;
        } catch { /* Relative/legacy server.url values are not authoritative public origins. */ }
    }
    return target.origin;
}

/** Origin takes precedence: an invalid or opaque Origin must never fall back to Referer. */
export function requestSourceOrigin(headers: IncomingHttpHeaders) {
    const value = headers.origin ?? headers.referer;
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value) throw new CsrfTokenError();
    return httpOrigin(value, headers.origin !== undefined);
}

/** Legacy CORS host entries inherit the target scheme; full origins match exactly. */
export function isAllowedRequestOrigin(source: string, target: string, cors = '') {
    const expected = httpOrigin(target, true);
    if (source === expected) return true;
    return cors.split(',').map((item) => item.trim()).filter(Boolean).some((item) => {
        try {
            return source === httpOrigin(item.includes('://') ? item : `${new URL(expected).protocol}//${item}`, true);
        } catch {
            return false;
        }
    });
}

export function assertRequestOrigin(options: {
    method: string;
    headers: IncomingHttpHeaders;
    target: string;
    cors?: string;
    protectSafeMethod?: boolean;
    allowUnattributed?: () => boolean;
}) {
    const { headers } = options;
    if (!options.protectSafeMethod && ['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) return;
    const source = requestSourceOrigin(headers);
    if (source !== undefined) {
        if (!isAllowedRequestOrigin(source, options.target, options.cors)) throw new CsrfTokenError();
        return;
    }
    const site = headers['sec-fetch-site'];
    if (site === 'cross-site') throw new CsrfTokenError();
    if (site === 'same-origin') return;
    // Browsers cannot send these cross-origin without a successful CORS preflight.
    // Accept is deliberately not used: an HTML form can set it too.
    const contentType = headers['content-type']?.split(';')[0].trim().toLowerCase();
    if (contentType === 'application/json' || headers['x-requested-with'] === 'XMLHttpRequest') return;
    // Only explicitly opted-in machine endpoints can accept unattributed simple requests.
    // Fetch Metadata marks a browser request, so it cannot use the machine exception.
    if (!Object.keys(headers).some((name) => name.startsWith('sec-fetch-')) && options.allowUnattributed?.()) return;
    throw new CsrfTokenError();
}
