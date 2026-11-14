export const NAMESPACE = 'login-with-github-next';
export const FAMILY = 'setting_github_login';
export const KEYS = {
    enabled: `${NAMESPACE}.enabled`,
    clientId: `${NAMESPACE}.clientId`,
    clientSecret: `${NAMESPACE}.clientSecret`,
    canRegister: `${NAMESPACE}.canRegister`,
    callbackUrl: `${NAMESPACE}.callbackUrl`,
};

export function callbackUrl(serverUrl: unknown): string | null {
    if (typeof serverUrl !== 'string' || !serverUrl.trim()) return null;
    try {
        const base = new URL(serverUrl.trim());
        if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) return null;
        if (!base.pathname.endsWith('/')) base.pathname += '/';
        return new URL('oauth/github/callback', base).href;
    } catch { return null; }
}

/** Never redirect to an external origin, protocol-relative URL, or a browser-normalized backslash URL. */
export function safeRedirect(value: unknown, base: string, fallback: string): string {
    if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('//')
        || Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return fallback;
    try {
        const target = new URL(value, base);
        if (target.origin !== new URL(base).origin || target.username || target.password) return fallback;
        return `${target.pathname}${target.search}${target.hash}`;
    } catch { return fallback; }
}
