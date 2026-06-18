import { useState, useRef } from 'react';
import { Button, Group, Text, Stack, Progress, Paper } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';

interface FileUploaderProps {
  action: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in bytes
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function FileUploader({
  action,
  accept,
  multiple = false,
  maxSize = 100 * 1024 * 1024, // 100MB default
  onComplete,
  onError,
}: FileUploaderProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
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
      for (const file of Array.from(files)) {
        formData.append('file', file);
      }

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      const result = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.error) reject(new Error(data.error.message));
            else resolve(data);
          } catch {
            resolve({ ok: true });
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('POST', action);
        xhr.send(formData);
      });

      onComplete?.(result);
    } catch (err: any) {
      const msg = err.message || 'Upload failed';
      setError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Stack gap="sm">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleUpload(e.target.files)}
        style={{ display: 'none' }}
      />
      <Group>
        <Button
          onClick={() => inputRef.current?.click()}
          loading={uploading}
          variant="light"
          size="sm"
        >
          {t('Upload')}
        </Button>
      </Group>
      {uploading && <Progress value={progress} size="sm" animated />}
      {error && <Text c="red" size="xs">{error}</Text>}
    </Stack>
  );
}
