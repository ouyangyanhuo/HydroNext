import { useEffect, useRef, useState } from 'react';
import { uploadForm, validateUploadFiles } from '@/utils/file-upload';
import { useI18n } from './use-i18n';

interface UploadOptions {
  action: string;
  accept?: readonly string[];
  multiple?: boolean;
  maxSize?: number;
  fields?: Record<string, string | number | boolean>;
  sequential?: boolean;
  onComplete?: (result: any) => void;
  onError?: (message: string) => void;
}

export function useFileUpload({
  action, accept = [], multiple = false, maxSize = 100 * 1024 * 1024,
  fields = {}, sequential = false, onComplete, onError,
}: UploadOptions) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  const upload = async (selection: FileList | File[] | null) => {
    if (request.current || !selection?.length) return;
    const files = Array.from(selection);
    const invalid = validateUploadFiles(files, { multiple, maxSize, accept });
    if (invalid) {
      const message = t(invalid.key, { name: invalid.name });
      setError(message);
      onError?.(message);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const batches = sequential ? files.map((file) => [file]) : [files];
      const results: any[] = [];
      for (const [index, batch] of batches.entries()) {
        if (controller.signal.aborted) return;
        const body = new FormData();
        Object.entries(fields).forEach(([key, value]) => body.append(key, String(value)));
        if (sequential) {
          if (!('operation' in fields)) body.append('operation', 'upload_file');
          body.append('filename', batch[0].name);
        }
        batch.forEach((file) => body.append('file', file));
        // These endpoints expect ordered per-file requests, not concurrent writes.
        const result = await uploadForm(action, body, controller.signal, (value) => {
          if (mounted.current) setProgress(Math.round(((index + value) / batches.length) * 100));
        }, t('Upload failed'));
        results.push(result);
      }
      if (mounted.current && !controller.signal.aborted) onComplete?.(sequential ? { ok: true, results } : results[0]);
    } catch (err: any) {
      if (!mounted.current || controller.signal.aborted) return;
      const message = err?.message || t('Upload failed');
      setError(message);
      onError?.(message);
    } finally {
      request.current = null;
      if (mounted.current) {
        setUploading(false);
        setProgress(0);
      }
    }
  };
  return { upload, uploading, progress, error };
}
