import { Badge, Card, HoverCard, Loader, Pagination, ScrollArea, SimpleGrid, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Button } from '@/components/common/button';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import type { HonorFrame } from '@/utils/honor-frame';
import { requestHonorFrame } from '@/utils/honor-frame-api';
import { HonorFramePreview } from './honor-frame-preview';

export function OwnedHonorFrames({ uid, avatar }: { uid: number, avatar?: string }) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: { frames: (HonorFrame & { active: boolean })[], page: number, pageCount: number };
    error?: string;
  } | null>(null);
  const url = buildUrl('user_honor_frames', { uid }, { page: String(page) });
  const key = `${url}:${retry}`;
  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;
  useEffect(() => {
    const controller = new AbortController();
    void requestHonorFrame(url, { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) setResult({ key, data: response });
    }).catch((err) => { if (!controller.signal.aborted) setResult({ key, error: err.message }); });
    return () => controller.abort();
  }, [url, key]);
  if (error) {
    return <Stack>
      <Text c="red" role="alert">{t(error)}</Text>
      <Button variant="light" onClick={() => setRetry((value) => value + 1)}>{t('Retry')}</Button>
    </Stack>;
  }
  if (!data) return <Loader size="sm" />;
  return <Stack gap="lg">
    {!data.frames.length && <Text ta="center" c="dimmed" py="xl">{t('No honor frames found.')}</Text>}
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">{data.frames.map((frame) => <HoverCard
      key={frame.id}
      width={320}
      shadow="md"
      withinPortal
      openDelay={180}>
      <HoverCard.Target><Card
        withBorder
        p="lg"
        tabIndex={0}
        aria-label={`${frame.name}: ${frame.description || t('No description yet.')}`}
        className="hydro-content-card hydro-frame-owned-card">
        <HonorFramePreview frame={frame} avatar={avatar} size={48} />
        <Text ta="center" fw={600} mt="md">{frame.name}</Text>
        {!frame.active && <Badge color="red" variant="light" mt="sm" mx="auto">{t('Disabled')}</Badge>}
      </Card></HoverCard.Target>
      <HoverCard.Dropdown className="hydro-frame-description-popover">
        <Text fw={650} mb="xs">{frame.name}</Text>
        <ScrollArea.Autosize mah={240} type="auto"><Text size="sm" className="hydro-frame-description">
          {frame.description || t('No description yet.')}
        </Text></ScrollArea.Autosize>
      </HoverCard.Dropdown>
    </HoverCard>)}</SimpleGrid>
    {data.pageCount > 1 && <Pagination size="sm" value={data.page} total={data.pageCount} onChange={setPage} />}
  </Stack>;
}
