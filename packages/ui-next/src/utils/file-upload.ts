import { formatErrorMessage } from './error';

export function validateUploadFiles(files: readonly File[], options: { multiple: boolean, maxSize: number, accept: readonly string[] }) {
  if (!options.multiple && files.length > 1) return { key: 'Please select only one file.', name: '' };
  const accepted = options.accept.flatMap((value) => value.split(',')).map((value) => value.trim().toLowerCase()).filter(Boolean);
  for (const file of files) {
    if (file.size > options.maxSize) return { key: 'File too large: {name}', name: file.name };
    const matches = !accepted.length || accepted.some((pattern) => {
      if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern);
      if (pattern.endsWith('/*')) return file.type.toLowerCase().startsWith(pattern.slice(0, -1));
      return file.type.toLowerCase() === pattern;
    });
    if (!matches) return { key: 'Unsupported file type: {name}', name: file.name };
  }
  return undefined;
}

/** Shared transport: HTTP failures and malformed JSON must never report success. */
export function uploadForm(action: string, body: FormData, signal: AbortSignal, progress: (value: number) => void, fallback: string) {
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    xhr.onload = () => {
      cleanup();
      let payload: any = { ok: true };
      const text = xhr.responseText.trim();
      try {
        if (text) payload = JSON.parse(text);
      } catch {
        reject(new Error(fallback));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || payload?.error) {
        reject(new Error(formatErrorMessage(payload?.error, fallback)));
        return;
      }
      resolve(payload);
    };
    xhr.onerror = () => fail(new Error(fallback));
    xhr.ontimeout = () => fail(new Error(fallback));
    xhr.onabort = () => fail(new DOMException('Upload aborted', 'AbortError'));
    xhr.upload.onprogress = (event) => {
      if (!signal.aborted && event.lengthComputable && event.total > 0) progress(event.loaded / event.total);
    };
    if (signal.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    try {
      xhr.open('POST', action);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(body);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
