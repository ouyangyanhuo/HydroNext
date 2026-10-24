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

export function avatarPixelSize(size: string | number = 'md') {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) return size;
  return typeof size === 'string' ? AVATAR_SIZES[size] : undefined;
}

/** Only our own image endpoint understands size variants; leave previews and remote URLs untouched. */
export function honorFrameImageSources(src: string | undefined, avatarSize: string | number) {
  const pixels = avatarPixelSize(avatarSize);
  if (!src || !pixels || !/^\/honor-frame\/[a-f0-9]{24}(?:\/(?:circle|square))?\.png(?:\?|$)/.test(src)) return { src };
  const url = new URL(src, 'https://hydro.invalid');
  const sizes = [64, 128, 256, 512];
  // Artwork surrounds a 384px opening in a 512px canvas.
  const displaySize = pixels * 4 / 3;
  const imageSize = sizes.find((size) => size >= displaySize) || 512;
  const variant = (size: number) => {
    url.searchParams.set('size', String(size));
    return `${url.pathname}${url.search}`;
  };
  return {
    src: variant(imageSize),
    srcSet: sizes.map((size) => `${variant(size)} ${size}w`).join(', '),
    sizes: `${displaySize}px`,
  };
}

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
