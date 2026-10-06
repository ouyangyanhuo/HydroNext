import { Badge, Card, FileInput, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { FramedAvatar } from '@/components/user/framed-avatar';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { useObjectUrl } from '@/hooks/use-object-url';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { getAvatarUrl } from '@/utils/avatar';
import type { HonorFrame } from '@/utils/honor-frame';
import { prepareFrameArtwork, requestHonorFrame } from '@/utils/honor-frame-api';

type ManagedFrame = HonorFrame & { active: boolean };

export default function ManageHonorFramesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const currentUser = useCurrentUser();
  const isAdmin = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const [uploadOpened, setUploadOpened] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const preview = useObjectUrl(file);
  const [editing, setEditing] = useState<ManagedFrame | null>(null);
  const [action, setAction] = useState<{ frame: ManagedFrame, operation: 'toggle' | 'grant' | 'revoke' } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [q, setQ] = useState(args.q || '');
  const [uid, setUid] = useState(String(args.targetUser?._id || ''));
  const target = args.targetUser;
  const previewUser = target || currentUser;
  const frames: ManagedFrame[] = args.frames || [];
  const owned = new Set<string>(args.grantedFrameIds || []);
  const url = buildUrl('manage_honor_frames');

  const mutate = async (body: FormData | Record<string, unknown>) => {
    const init = body instanceof FormData
      ? { method: 'POST', body }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return requestHonorFrame(url, init, t('Operation failed'));
  };

  const run = async (operation: () => Promise<unknown>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    try {
      await operation();
      notifications.show({ title: t('Saved'), message: '', color: 'green' });
      await navigate(window.location.pathname + window.location.search);
      return true;
    } catch (err: any) {
      notifications.show({ title: t('Operation failed'), message: t(err.message || 'Operation failed'), color: 'red' });
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (!isAdmin) return <Text>{t('Access Denied')}</Text>;

  return (
    <Stack gap="lg">
      <PageHeader title={t('Manage honor frames')}>
        <Group gap="xs">
          <Button component={Link} to="manage_dashboard" size="xs" variant="subtle">{t('System Management')}</Button>
          <Button size="xs" disabled={busy} onClick={() => setUploadOpened(true)}>{t('Upload frame')}</Button>
        </Group>
      </PageHeader>
      <Card withBorder p="lg" className="hydro-content-card">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('Frames are global. Upload as a draft, then publish before awarding to a user.')}</Text>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            const value = uid.trim();
            if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)) {
              notifications.show({ title: t('Operation failed'), message: t('Enter a valid user ID.'), color: 'red' });
              return;
            }
            void navigate(buildUrl('manage_honor_frames', {}, { ...(value ? { uid: value } : {}), ...(q.trim() ? { q: q.trim() } : {}) }));
          }}>
            <Group align="flex-end" gap="sm">
              <TextInput label={t('Search frames')} value={q} maxLength={80} onChange={(event) => setQ(event.currentTarget.value)} disabled={busy} />
              <TextInput
                label={t('Recipient user ID')}
                inputMode="numeric"
                value={uid}
                onChange={(event) => setUid(event.currentTarget.value)}
                disabled={busy} />
              <Button type="submit" variant="light" disabled={busy}>{t('Search')}</Button>
            </Group>
          </form>
          <Text size="sm">{target
            ? `${t('Managing awards for')}: ${target.uname} (#${target._id})`
            : t('Select a user by ID to grant or revoke frames.')}</Text>
        </Stack>
      </Card>
      {!frames.length && <Card withBorder p="xl" className="hydro-content-card">
        <Text c="dimmed" ta="center">{t('No honor frames found.')}</Text>
      </Card>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
        {frames.map((frame) => (
          <Card key={frame.id} withBorder p="lg" className="hydro-content-card">
            <Stack gap="md" align="center" className="h-full">
              <Group gap="xs">
                <Badge variant="light" color={frame.active ? undefined : 'gray'}>{t(frame.active ? 'Published' : 'Unpublished')}</Badge>
                {target && owned.has(frame.id) && <Badge variant="outline">{t('Awarded')}</Badge>}
              </Group>
              <FramedAvatar src={getAvatarUrl(previewUser.avatar || '', 96)} alt={previewUser.uname} frame={frame} size={72} radius="xl" />
              <Text fw={700} ta="center" lineClamp={2}>{frame.name}</Text>
              <Group justify="center" gap="xs" mt="auto">
                <Button size="xs" variant="default" disabled={busy} onClick={() => setEditing(frame)}>{t('Rename')}</Button>
                <Button size="xs" variant="light" disabled={busy} onClick={() => setAction({ frame, operation: 'toggle' })}>
                  {t(frame.active ? 'Unpublish' : 'Publish')}
                </Button>
                {target && <Button
                  size="xs"
                  variant="light"
                  color={owned.has(frame.id) ? 'red' : undefined}
                  disabled={busy || (!frame.active && !owned.has(frame.id))}
                  onClick={() => setAction({ frame, operation: owned.has(frame.id) ? 'revoke' : 'grant' })}>
                  {t(owned.has(frame.id) ? 'Revoke frame' : 'Grant frame')}
                </Button>}
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      <Paginator page={args.page || 1} totalPages={args.pageCount || 1} />
      <FormDialog
        opened={uploadOpened}
        onClose={() => { setUploadOpened(false); setFile(null); }}
        title={t('Upload frame')}
        fields={[{ name: 'name', label: t('Frame name'), required: true }]}
        confirmLabel={t('Upload')}
        loading={busy}
        onSubmit={async (values) => {
          if (!file) throw new Error(t('Choose a PNG or WebP file no larger than 2 MiB.'));
          const success = await run(async () => {
            const artwork = await prepareFrameArtwork(file);
            const body = new FormData();
            body.append('operation', 'upload');
            body.append('name', String(values.name));
            body.append('file', artwork);
            await mutate(body);
          });
          if (success) {
            setUploadOpened(false);
            setFile(null);
          }
        }}
      >
        <FileInput
          label={t('Frame artwork')}
          description={t('Transparent square PNG or WebP, 64–1024 px, up to 2 MiB. Leave the center clear.')}
          accept="image/png,image/webp"
          value={file}
          onChange={(next) => {
            if (next && (!['image/png', 'image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024)) {
              notifications.show({ title: t('Operation failed'), message: t('Choose a PNG or WebP file no larger than 2 MiB.'), color: 'red' });
              return;
            }
            setFile(next);
          }}
          clearable
          required />
        {preview && <Group justify="center">
          <FramedAvatar
            src={getAvatarUrl(currentUser.avatar || '', 96)}
            size={80}
            radius="xl"
            frame={{ id: 'preview', name: file?.name || '', imageUrl: preview }} />
        </Group>}
      </FormDialog>
      <FormDialog
        opened={!!editing}
        onClose={() => setEditing(null)}
        title={t('Rename')}
        fields={[{ name: 'name', label: t('Frame name'), required: true, defaultValue: editing?.name || '' }]}
        confirmLabel={t('Save')}
        loading={busy}
        onSubmit={async (values) => {
          if (!editing) return;
          const success = await run(() => mutate({ operation: 'update', id: editing.id, name: values.name, active: editing.active }));
          if (success) setEditing(null);
        }}
      />
      <ConfirmDialog
        opened={!!action}
        onClose={() => setAction(null)}
        title={t('Honor avatar frame')}
        loading={busy}
        confirmColor={action?.operation === 'revoke' || (action?.operation === 'toggle' && action.frame.active) ? 'red' : 'hydroTeal'}
        message={action?.operation === 'toggle'
          ? t(action.frame.active ? 'Unpublish this frame? It will stop displaying for all users.' : 'Publish this frame so it can be awarded?')
          : t(action?.operation === 'revoke'
            ? 'Revoke this frame from {user}? It will also be unequipped.'
            : 'Grant this frame to {user}?', { user: target?.uname || '' })}
        onConfirm={async () => {
          if (!action) return;
          const { frame, operation } = action;
          const success = await run(() => mutate(operation === 'toggle'
            ? { operation: 'update', id: frame.id, name: frame.name, active: !frame.active }
            : { operation, id: frame.id, uid: target._id }));
          if (success) setAction(null);
        }}
      />
    </Stack>
  );
}
