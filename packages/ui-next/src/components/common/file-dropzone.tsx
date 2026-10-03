import { Paper, Progress, Stack, Text } from '@mantine/core';
import { useRef, useState } from 'react';
import { useFileUpload } from '@/hooks/use-file-upload';
import { useI18n } from '@/hooks/use-i18n';

interface FileDropzoneProps {
  action: string;
  accept?: string[];
  fields?: Record<string, string | number | boolean>;
  multiple?: boolean;
  maxSize?: number;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function FileDropzone({ multiple = true, accept = [], ...options }: FileDropzoneProps) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const { upload, uploading, progress, error } = useFileUpload({ ...options, multiple, accept, sequential: true });
  const choose = () => { if (!uploading) input.current?.click(); };

  return (
    <Stack gap="sm">
      <input
        ref={input}
        type="file"
        accept={accept.join(',')}
        multiple={multiple}
        disabled={uploading}
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = '';
          void upload(files);
        }}
      />
      <Paper
        p="xl"
        withBorder
        role="button"
        tabIndex={0}
        aria-label={t('Drag files here or click to upload')}
        aria-disabled={uploading}
        aria-busy={uploading}
        className="hydro-file-dropzone"
        style={{
          borderStyle: 'dashed',
          borderColor: dragging && !uploading ? 'var(--hydro-primary)' : 'var(--hydro-border)',
          backgroundColor: dragging && !uploading ? 'var(--hydro-surface-muted)' : 'var(--hydro-surface-raised)',
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'border-color var(--hydro-duration-normal), background-color var(--hydro-duration-normal)',
        }}
        onClick={choose}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          depth.current++;
          if (!uploading) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          depth.current = 0;
          setDragging(false);
          void upload(event.dataTransfer.files);
        }}
      >
        <Stack align="center" gap="xs">
          <Text size="sm" c="dimmed" role="status">
            {uploading ? t('Uploading...') : t('Drag files here or click to upload')}
          </Text>
        </Stack>
      </Paper>
      {uploading && <Progress value={progress} size="sm" aria-label={t('Uploading...')} />}
      {error && <Text c="red" size="xs" role="alert">{error}</Text>}
    </Stack>
  );
}
