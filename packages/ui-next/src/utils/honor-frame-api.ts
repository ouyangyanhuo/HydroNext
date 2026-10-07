import { formatErrorMessage } from './error';

export async function requestHonorFrame(url: string, init: RequestInit = {}, fallback = 'Operation failed') {
  const response = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init.headers } });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(fallback);
  }
  if (!response.ok || !data || data.error) {
    const params = data?.error?.params;
    if (params?.length === 3 && typeof params[2] === 'string') {
      throw Object.assign(new Error(params[2]), {
        ...(['circle', 'square'].includes(params[0]) ? { frameShape: params[0] } : {}),
      });
    }
    throw new Error(formatErrorMessage(data?.error, fallback));
  }
  return data;
}

/** WebP is normalized in the browser; the server independently decodes PNG. */
export async function prepareFrameArtwork(file: File, paired = false): Promise<File> {
  if (!['image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error('Choose a PNG or WebP file no larger than 2 MiB.');
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    if (bitmap.width !== bitmap.height || bitmap.width < 64 || bitmap.width > 1024) {
      throw new Error('Frame artwork must be square, between 64 and 1024 pixels.');
    }
    if (paired && bitmap.width !== 512) throw new Error('Frame artwork must be 512 × 512 px.');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to process frame artwork.');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Unable to process frame artwork.'));
    }, 'image/png'));
    if (blob.size > 2 * 1024 * 1024) throw new Error('Choose a PNG or WebP file no larger than 2 MiB.');
    return new File([blob], 'honor-frame.png', { type: 'image/png' });
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
