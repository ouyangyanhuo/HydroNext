/**
 * Convert Hydro avatar format to a proper URL
 * Supported formats:
 * - gravatar:email@example.com
 * - qq:12345678
 * - github:username
 * - url:https://example.com/avatar.png
 */

function md5(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, bitLength, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000));
  const rotateLeft = (value: number, amount: number) => (value << amount) | (value >>> (32 - amount));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    const m = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true));

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const next = d;
      d = c;
      c = b;
      b = (b + rotateLeft((a + f + k[i] + m[g]) | 0, s[i])) | 0;
      a = next;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  return [a0, b0, c0, d0]
    .map((value) => {
      const hex = (value >>> 0).toString(16).padStart(8, '0');
      return hex.match(/../g)!.reverse().join('');
    })
    .join('');
}

const GRAVATAR_URL = 'https://cravatar.cn/avatar/';

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
