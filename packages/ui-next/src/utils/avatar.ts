/**
 * Convert Hydro avatar format to a proper URL
 * Supported formats:
 * - gravatar:email@example.com
 * - qq:12345678
 * - github:username
 * - url:https://example.com/avatar.png
 */

function md5(str: string): string {
  // Simple MD5 hash for Gravatar
  // In production, use a proper MD5 library
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Return a hex string (this is a simplified version, not real MD5)
  return Math.abs(hash).toString(16).padStart(32, '0');
}

const GRAVATAR_URL = 'https://www.gravatar.com/avatar/';

const providers: Record<string, (src: string, size?: number) => string> = {
  gravatar: (email, size = 64) => {
    const hash = md5((email || '').trim().toLowerCase());
    return `${GRAVATAR_URL}${hash}?d=mm&s=${size}`;
  },
  qq: (id) => `https://q1.qlogo.cn/g?b=qq&nk=${(/(\d+)/.exec(id) || ['', ''])[1]}&s=160`,
  github: (id, size = 64) => `https://github.com/${id}.png?size=${Math.min(size, 460)}`,
  url: (url) => url,
};

export function getAvatarUrl(src: string, size = 64): string {
  if (!src) return providers.gravatar('', size);

  const index = src.indexOf(':');
  if (index === -1) return providers.gravatar('', size);

  const provider = src.substring(0, index);
  const value = src.substring(index + 1);

  if (!providers[provider] || !value) return providers.gravatar('', size);

  return providers[provider](value, size);
}
