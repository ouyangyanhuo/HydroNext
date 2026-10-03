import { Badge, Card, FileInput, Group, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { getAvatarUrl } from '@/utils/avatar';
import { FramedAvatar } from './framed-avatar';

export function HonorFramePanel({ administration = false }: { administration?: boolean }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const isAdmin = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const previewUrl = useRef<string | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);
  if (administration && !isAdmin) return null;
  const frame = administration && preview
    ? { id: 'local-preview', name: file?.name || '', imageUrl: preview }
    : user.honorFrame;

  return (
    <Card withBorder p="lg" className="hydro-content-card">
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={700}>{t('Honor avatar frame')}</Text>
          <Badge variant="light">{t('Global appearance')}</Badge>
        </Group>
        <Group gap="lg" align="center">
          <FramedAvatar src={getAvatarUrl(user.avatar || '', 96)} alt={user.uname} size={80} radius="xl" frame={frame} />
          <Stack gap={4} className="min-w-0 flex-1">
            <Text size="sm">{frame?.name || t('No honor frame equipped')}</Text>
            <Text size="sm" c="dimmed">{t('Honor frames belong to your global account and remain the same in every domain.')}</Text>
          </Stack>
        </Group>
        {administration && (
          <FileInput
            label={t('Preview frame artwork')}
            description={t('Transparent PNG or WebP, up to 2 MiB. Preview only; nothing is uploaded.')}
            accept="image/png,image/webp"
            value={file}
            clearable
            error={error}
            onChange={(next) => {
              if (next && (!['image/png', 'image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024)) {
                setError(t('Choose a PNG or WebP file no larger than 2 MiB.'));
                return;
              }
              setError('');
              if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
              previewUrl.current = next ? URL.createObjectURL(next) : undefined;
              setPreview(previewUrl.current);
              setFile(next);
            }}
          />
        )}
        <Text size="xs" c="dimmed" role="status">
          {t(administration
            ? 'Publishing and awarding frames will be enabled after server integration.'
            : 'Honor frames are supplied by system administrators. Equipping will be available after server integration.')}
        </Text>
        <Button variant="light" size="xs" disabled>
          {t(administration ? 'Publish frame (coming soon)' : 'Choose frame (coming soon)')}
        </Button>
      </Stack>
    </Card>
  );
}
