import { Group, Progress, Stack, Text } from '@mantine/core';
import { useRef } from 'react';
import { Button } from '@/components/common/button';
import { useFileUpload } from '@/hooks/use-file-upload';
import { useI18n } from '@/hooks/use-i18n';

interface FileUploaderProps {
  action: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function FileUploader({ accept, multiple = false, ...options }: FileUploaderProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, progress, error } = useFileUpload({ ...options, accept: accept?.split(','), multiple });

  return (
    <Stack gap="sm">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={uploading}
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = '';
          void upload(files);
        }}
      />
      <Group>
        <Button onClick={() => inputRef.current?.click()} loading={uploading} variant="light" size="sm">
          {t('Upload')}
        </Button>
      </Group>
      {uploading && <Progress value={progress} size="sm" aria-label={t('Uploading...')} />}
      {error && <Text c="red" size="xs" role="alert">{error}</Text>}
    </Stack>
  );
}
