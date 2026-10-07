/** Global user decoration. Never store this in a domain-user document. */
export interface HonorFrame {
  id: string;
  name: string;
  description?: string;
  imageUrl: string;
  squareImageUrl?: string;
  circleImageUrl?: string;
  artworkVersion?: 2;
}

const AVATAR_SIZES: Record<string, number> = { xs: 16, sm: 26, md: 38, lg: 56, xl: 84 };

export function avatarFrameInset(size: string | number = 'md', version?: number) {
  const pixels = typeof size === 'number' ? size : AVATAR_SIZES[size] ?? 40;
  if (version === 2) return Number.isFinite(pixels) ? pixels / 6 : 40 / 6;
  return Math.min(10, Math.max(2, Number.isFinite(pixels) ? Math.round(pixels / 10) : 4));
}

export function honorFrameImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const url = value.trim();
  if (/^\/(?!\/)/.test(url) && !url.includes('\\')) return url;
  try {
    const parsed = new URL(url);
    if (['https:', 'http:', 'blob:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return url;
  } catch { /* Ignore malformed decoration metadata. */ }
  return undefined;
}
