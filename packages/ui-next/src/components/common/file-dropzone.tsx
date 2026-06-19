import { useState, useCallback } from 'react';
import { Text, Stack, Progress, Paper } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

interface FileDropzoneProps {
  action: string;
  accept?: string[];
  fields?: Record<string, string | number | boolean>;
  multiple?: boolean;
  maxSize?: number;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function FileDropzone({
  action,
  accept = [],
  fields = {},
  multiple = true,
  maxSize = 100 * 1024 * 1024,
  onComplete,
  onError,
}: FileDropzoneProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (file.size > maxSize) {
        const msg = t('File too large: {name}', { name: file.name });
        setError(msg);
        onError?.(msg);
        return;
      }
    }

    setUploading(true);
    setError('');
    setProgress(0);

    try {
      const results: any[] = [];
      for (const [index, file] of fileArray.entries()) {
        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) {
          formData.append(key, String(value));
        }
        if (!('operation' in fields)) formData.append('operation', 'upload_file');
        formData.append('filename', file.name);
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const fileProgress = e.loaded / e.total;
          setProgress(Math.round(((index + fileProgress) / fileArray.length) * 100));
        };

        const result = await new Promise<any>((resolve, reject) => {
          xhr.onload = () => {
            const contentType = xhr.getResponseHeader('content-type') || '';
            let payload: any = { ok: xhr.status >= 200 && xhr.status < 400 };
            if (contentType.includes('json') && xhr.responseText) {
              try {
                payload = JSON.parse(xhr.responseText);
              } catch (err) {
                reject(err);
                return;
              }
            }
            if (xhr.status < 200 || xhr.status >= 400) {
              reject(new Error(payload?.error?.message || xhr.statusText || 'Upload failed'));
              return;
            }
            resolve(payload);
          };
          xhr.onerror = () => reject(new Error('Upload failed'));
          xhr.open('POST', action);
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send(formData);
        });

        if (result.error) {
          const msg = formatErrorMessage(result.error, t('Upload failed'));
          throw new Error(msg);
        }
        results.push(result);
        setProgress(Math.round(((index + 1) / fileArray.length) * 100));
      }
      onComplete?.({ ok: true, results });
    } catch (err: any) {
      const msg = err.message || 'Upload failed';
      setError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [action, fields, maxSize, onComplete, onError, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    if (accept.length) input.accept = accept.join(',');
    input.onchange = () => { if (input.files) handleFiles(input.files); };
    input.click();
  }, [multiple, accept, handleFiles]);

  return (
    <Stack gap="sm">
      <Paper
        p="xl"
        withBorder
        style={{
          borderStyle: 'dashed',
          borderColor: dragging ? 'var(--hydro-primary)' : 'var(--hydro-border)',
          backgroundColor: dragging ? 'var(--hydro-surface)' : 'transparent',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <Stack align="center" gap="xs">
          <Text size="sm" c="dimmed">
            {uploading ? t('Uploading...') : t('Drag files here or click to upload')}
          </Text>
        </Stack>
      </Paper>
      {uploading && <Progress value={progress} size="sm" animated />}
      {error && <Text c="red" size="xs">{error}</Text>}
    </Stack>
  );
}
