import { getAvatarUrl, useI18n } from '@hydrooj/ui-next';
import { Group, Stack, Text } from '@mantine/core';
import type { HonorFrame } from '../../utils/honor-frame';
import { FramedAvatar } from './framed-avatar';

export function HonorFramePreview({ frame, avatar = '', size = 64 }: { frame: HonorFrame, avatar?: string, size?: number }) {
  const { t } = useI18n();
  return <Group justify="center" gap="xl" wrap="nowrap" className="hydro-frame-preview">
    {(['square', 'circle'] as const).map((shape) => <Stack key={shape} gap={8} align="center">
      <FramedAvatar frame={frame} shape={shape} size={size} src={getAvatarUrl(avatar, size * 2)} />
      <Text size="xs" c="dimmed">{t(shape === 'circle' ? 'Circular' : 'Rounded square')}</Text>
    </Stack>)}
  </Group>;
}
