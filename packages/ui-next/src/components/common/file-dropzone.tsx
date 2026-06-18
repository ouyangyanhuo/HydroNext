import { useState, useCallback } from 'react';
import { Group, Text, Stack, Progress, Paper } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';

interface FileDropzoneProps {
  action: string;
  accept?: string[];
  multiple?: boolean;
  maxSize?: number;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function FileDropzone({
  action,
  accept = [],
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
      const formData = new FormData();
      for (const file of fileArray) {
        formData.append('file', file);
      }

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };

      const result = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve({ ok: true }); }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('POST', action);
        xhr.send(formData);
      });

      if (result.error) {
        setError(result.error.message || 'Upload failed');
        onError?.(result.error.message);
      } else {
        onComplete?.(result);
      }
    } catch (err: any) {
      const msg = err.message || 'Upload failed';
      setError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [action, maxSize, onComplete, onError, t]);

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
