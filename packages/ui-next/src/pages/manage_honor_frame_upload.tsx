import { Card, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPhoto, IconUpload } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { Button, UnstyledButton } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { FramedAvatar } from '@/components/user/framed-avatar';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useHonorFrameMutation } from '@/hooks/use-honor-frame-mutation';
import { useI18n } from '@/hooks/use-i18n';
import { useObjectUrl } from '@/hooks/use-object-url';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { getAvatarUrl } from '@/utils/avatar';
import { prepareFrameArtwork } from '@/utils/honor-frame-api';

function ArtworkInput({ shape, file, onChange, disabled }: {
  shape: 'square' | 'circle'; file: File | null; onChange: (file: File) => void; disabled: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const preview = useObjectUrl(file);
  const user = useCurrentUser();
  const [dragging, setDragging] = useState(false);
  const label = t(shape === 'circle' ? 'Circular artwork' : 'Rounded square artwork');
  const choose = (next?: File) => {
    if (disabled || !next) return;
    if (!['image/png', 'image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024) {
      notifications.show({ title: t('Operation failed'), message: t('Choose a PNG or WebP file no larger than 2 MiB.'), color: 'red' });
      return;
    }
    onChange(next);
  };
  return <Stack gap="sm">
    <Text fw={650}>{label}</Text>
    <input
      ref={input}
      type="file"
      accept="image/png,image/webp"
      hidden
      disabled={disabled}
      aria-label={label}
      onChange={(event) => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
    <UnstyledButton
      className="hydro-frame-upload"
      data-dragging={dragging || undefined}
      disabled={disabled}
      onClick={() => input.current?.click()}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault(); setDragging(false);
        if (event.dataTransfer.files.length !== 1) {
          notifications.show({ title: t('Operation failed'), message: t('Choose one artwork per shape.'), color: 'red' });
          return;
        }
        choose(event.dataTransfer.files[0]);
      }}>
      <Stack align="center" gap="md">
        {preview ? <FramedAvatar
          shape={shape}
          size={120}
          src={getAvatarUrl(user.avatar || '', 240)}
          frame={{ id: 'preview', name: '', imageUrl: preview, artworkVersion: 2 }} />
          : <span className={`hydro-frame-upload__guide hydro-frame-upload__guide--${shape}`}><IconPhoto size={30} /></span>}
        <Text size="sm" fw={600}>{file?.name || t('Drop artwork here or click to choose')}</Text>
        <Text size="xs" c="dimmed">PNG / WebP · 512 × 512px · ≤ 2 MiB</Text>
      </Stack>
    </UnstyledButton>
    <Text size="xs" c="dimmed">{t(shape === 'circle'
      ? 'Transparent center: diameter 384 px, centered at (256, 256).'
      : 'Transparent center: 384 × 384 px, corner radius 64 px, starting at (64, 64).')}</Text>
  </Stack>;
}

export default function UploadHonorFramePage() {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const isAdmin = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const { busy, run } = useHonorFrameMutation();
  const [preparing, setPreparing] = useState(false);
  const pending = useRef(false);
  const [name, setName] = useState('');
  const [square, setSquare] = useState<File | null>(null);
  const [circle, setCircle] = useState<File | null>(null);
  if (!isAdmin) return <Text>{t('Access Denied')}</Text>;
  const locked = busy || preparing;
  return <Stack gap="lg">
    <PageHeader title={t('Upload frame')}><Button component={Link} to="manage_honor_frames" variant="subtle">{t('Back')}</Button></PageHeader>
    <Card withBorder p="xl" className="hydro-content-card">
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (pending.current) return;
        if (!square || !circle) {
          notifications.show({ title: t('Operation failed'), message: t('Upload both rounded square and circular artwork.'), color: 'red' });
          return;
        }
        pending.current = true;
        setPreparing(true);
        try {
          const [squarePng, circlePng] = await Promise.all([prepareFrameArtwork(square, true), prepareFrameArtwork(circle, true)]);
          const body = new FormData();
          body.append('operation', 'upload'); body.append('name', name);
          body.append('square', squarePng); body.append('circle', circlePng);
          if (await run(body, buildUrl('manage_honor_frames'))) {
            setName('');
            setSquare(null);
            setCircle(null);
          }
        } catch (err: any) {
          notifications.show({ title: t('Operation failed'), message: t(err.message), color: 'red' });
        } finally { pending.current = false; setPreparing(false); }
      }}><Stack gap="xl">
          <TextInput
            label={t('Frame name')}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            disabled={locked} />
          <Text size="sm" c="dimmed">{t(
            'One name, two shapes. Canvas: 512 × 512 px; avatar: 384 px; decoration margin: 64 px. Leave the center transparent, not white.',
          )}</Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
            <ArtworkInput shape="square" file={square} onChange={setSquare} disabled={locked} />
            <ArtworkInput shape="circle" file={circle} onChange={setCircle} disabled={locked} />
          </SimpleGrid>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">{t('Uploaded frames start disabled. Publish them from the library.')}</Text>
            <Button type="submit" loading={locked} leftSection={<IconUpload size={16} />}>{t('Upload frame')}</Button>
          </Group>
        </Stack></form>
    </Card>
  </Stack>;
}
