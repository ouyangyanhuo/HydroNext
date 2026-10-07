import { Badge, Card, Group, Loader, Pagination, SimpleGrid, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { Link } from '@/components/link';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';
import { getAvatarUrl } from '@/utils/avatar';
import type { HonorFrame } from '@/utils/honor-frame';
import { requestHonorFrame } from '@/utils/honor-frame-api';
import { FramedAvatar } from './framed-avatar';
import { HonorFramePreview } from './honor-frame-preview';

function HonorFrameWardrobe() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const buildUrl = useBuildUrl();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ frames: HonorFrame[], pageCount: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const mutation = useRef<AbortController | null>(null);
  const url = buildUrl('home_honor_frames');
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    void requestHonorFrame(`${url}?page=${page}&noTemplate=true`, { signal: controller.signal }, t('Operation failed')).then((result) => {
      if (controller.signal.aborted) return;
      setData(result);
      setPage(result.page);
      useSessionStore.setState((state) => ({ user: { ...state.user, honorFrame: result.honorFrame } }));
    }).catch((err) => {
      if (!controller.signal.aborted) {
        setError(err.message);
        notifications.show({ title: t('Operation failed'), message: err.message, color: 'red' });
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision, t, url]);

  const equip = async (id: string) => {
    if (mutation.current || loading) return;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    try {
      const result = await requestHonorFrame(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), signal: controller.signal,
      }, t('Operation failed'));
      if (!controller.signal.aborted) {
        useSessionStore.setState((state) => ({ user: { ...state.user, honorFrame: result.honorFrame } }));
        notifications.show({ title: t('Saved'), message: '', color: 'green' });
      }
    } catch (err: any) {
      if (!controller.signal.aborted) notifications.show({ title: t('Operation failed'), message: err.message, color: 'red' });
    } finally {
      mutation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <Group gap="lg">
        <FramedAvatar src={getAvatarUrl(user.avatar || '', 96)} alt={user.uname} size={80} shape="circle" frame={user.honorFrame} />
        <Stack gap={4} className="min-w-0 flex-1">
          <Text fw={600}>{user.honorFrame?.name || t('No honor frame equipped')}</Text>
          {user.honorFrame && <Text size="sm" className="hydro-frame-description">{user.honorFrame.description || t('No description yet.')}</Text>}
          <Text size="sm" c="dimmed">{t('Honor frames belong to your global account and remain the same in every domain.')}</Text>
        </Stack>
        <Button size="xs" variant="default" disabled={!user.honorFrame || loading} loading={busy} onClick={() => equip('')}>
          {t('Unequip frame')}
        </Button>
      </Group>
      {loading ? <Loader size="sm" /> : error ? <Stack gap="xs">
        <Text c="red" role="alert">{error}</Text>
        <Button
          size="xs"
          variant="light"
          onClick={() => {
            setLoading(true);
            setError('');
            setRevision((value) => value + 1);
          }}>{t('Retry')}</Button>
      </Stack> : (
        <>
          {!data?.frames.length && <Text size="sm" c="dimmed">{t('No available honor frames. Frames are awarded by system administrators.')}</Text>}
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
            {data?.frames.map((frame) => (
              <Card key={frame.id} withBorder p="sm" className="hydro-panel">
                <Stack align="center" gap="sm">
                  <HonorFramePreview frame={frame} avatar={user.avatar} size={40} />
                  <Text size="sm" fw={600} ta="center" lineClamp={2}>{frame.name}</Text>
                  <Text size="sm" c="dimmed" ta="center" className="hydro-frame-description">{frame.description || t('No description yet.')}</Text>
                  <Button
                    size="xs"
                    variant={user.honorFrame?.id === frame.id ? 'light' : 'default'}
                    disabled={busy || user.honorFrame?.id === frame.id}
                    onClick={() => equip(frame.id)}>
                    {t(user.honorFrame?.id === frame.id ? 'Equipped' : 'Equip frame')}
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
          {data && data.pageCount > 1 && <Pagination
            size="xs"
            total={data.pageCount}
            value={page}
            disabled={busy}
            onChange={(value) => {
              setLoading(true);
              setError('');
              setPage(value);
            }} />}
        </>
      )}
    </Stack>
  );
}

export function HonorFramePanel({ administration = false }: { administration?: boolean }) {
  const { t } = useI18n();
  const isAdmin = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  if (administration && !isAdmin) return null;
  return (
    <Card withBorder p="lg" className="hydro-content-card">
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={700}>{t('Honor avatar frame')}</Text>
          <Badge variant="light">{t('Global appearance')}</Badge>
        </Group>
        {administration ? (
          <>
            <Text size="sm" c="dimmed">{t('Upload artwork, publish frames, and manage user awards across all domains.')}</Text>
            <Button component={Link} to="manage_honor_frames" variant="light" size="xs">{t('Manage honor frames')}</Button>
          </>
        ) : <HonorFrameWardrobe />}
      </Stack>
    </Card>
  );
}
