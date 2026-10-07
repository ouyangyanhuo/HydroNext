import { Card, Group, SimpleGrid, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconEye, IconGift, IconPencil, IconTrash, IconUpload, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { ActionIcon, Button, UnstyledButton } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { HonorFrameGrantDialog } from '@/components/user/honor-frame-grant-dialog';
import { HonorFramePreview } from '@/components/user/honor-frame-preview';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useHonorFrameMutation } from '@/hooks/use-honor-frame-mutation';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import type { HonorFrame } from '@/utils/honor-frame';

type ManagedFrame = HonorFrame & { active: boolean };
export default function ManageHonorFramesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useCurrentUser();
  const isAdmin = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const { busy, run } = useHonorFrameMutation();
  const [grantOpened, setGrantOpened] = useState(false);
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [action, setAction] = useState<ManagedFrame | null>(null);
  const [deleting, setDeleting] = useState<ManagedFrame | null>(null);
  const [descriptionFrame, setDescriptionFrame] = useState<ManagedFrame | null>(null);
  const [description, setDescription] = useState('');
  const [q, setQ] = useState(args.q || '');
  const frames: ManagedFrame[] = args.frames || [];
  if (!isAdmin) return <Text>{t('Access Denied')}</Text>;
  return <Stack gap="lg">
    <PageHeader title={t('Manage honor frames')}>
      <Group gap="sm">
        <Button component={Link} to="manage_honor_frame_upload" variant="default" leftSection={<IconUpload size={16} />}>{t('Upload frame')}</Button>
        <Button onClick={() => setGrantOpened(true)} disabled={busy} leftSection={<IconGift size={16} />}>{t('Grant frame')}</Button>
      </Group>
    </PageHeader>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      void navigate(buildUrl('manage_honor_frames', {}, { q: q.trim() }));
    }}><Group gap="sm">
        <TextInput
          aria-label={t('Search frames')}
          placeholder={t('Search frames')}
          value={q}
          maxLength={80}
          onChange={(event) => setQ(event.currentTarget.value)}
          className="flex-1" />
        <Button type="submit" variant="light" disabled={busy}>{t('Search')}</Button>
      </Group></form>
    {!frames.length && <Text c="dimmed" ta="center" py="xl">{t('No honor frames found.')}</Text>}
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
      {frames.map((frame) => <Card key={frame.id} withBorder p="lg" className="hydro-content-card hydro-frame-card">
        <Group justify="space-between" mb="lg">
          <Button
            size="compact-xs"
            variant="light"
            color={frame.active ? 'green' : 'red'}
            onClick={() => setAction(frame)}
            disabled={busy}
            aria-label={`${frame.name}: ${t(frame.active ? 'Unpublish' : 'Publish')}`}>
            {t(frame.active ? 'Published' : 'Disabled')}
          </Button>
          <Group gap={4} className="hydro-frame-card__view">
            <Tooltip label={t('Edit frame')}>
              <ActionIcon
                component={Link}
                href={buildUrl('manage_honor_frame_upload', {}, { id: frame.id })}
                variant="subtle"
                disabled={busy}
                aria-label={`${t('Edit frame')}: ${frame.name}`}><IconPencil size={19} /></ActionIcon>
            </Tooltip>
            <Tooltip label={t('Frame owners')}>
              <ActionIcon
                component={Link}
                to="manage_honor_frame_owners"
                params={{ id: frame.id }}
                variant="subtle"
                aria-label={t('Frame owners')}><IconEye size={19} /></ActionIcon>
            </Tooltip>
            <Tooltip label={t('Delete frame')}>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={busy}
                aria-label={`${t('Delete frame')}: ${frame.name}`}
                onClick={() => setDeleting(frame)}><IconTrash size={19} /></ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <HonorFramePreview frame={frame} avatar={user.avatar} />
        {editing === frame.id ? <form
          className="mt-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run({ operation: 'rename', id: frame.id, name })) setEditing('');
          }}><Group gap={6} wrap="nowrap">
            <TextInput
              aria-label={t('Frame name')}
              autoFocus
              value={name}
              maxLength={80}
              required
              disabled={busy}
              className="flex-1"
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Escape' && !busy) setEditing(''); }} />
            <ActionIcon type="submit" loading={busy} aria-label={t('Save')}><IconCheck size={16} /></ActionIcon>
            <ActionIcon variant="subtle" disabled={busy} onClick={() => setEditing('')} aria-label={t('Cancel')}><IconX size={16} /></ActionIcon>
          </Group></form> : <UnstyledButton
          className="hydro-frame-card__name"
          disabled={busy}
          aria-label={`${t('Rename')}: ${frame.name}`}
          onClick={() => { setEditing(frame.id); setName(frame.name); }}>
          <Text fw={650} ta="center" lineClamp={2}>{frame.name}</Text>
        </UnstyledButton>}
        <UnstyledButton
          className="hydro-frame-card__description"
          aria-label={`${t('Edit description')}: ${frame.name}`}
          disabled={busy}
          onClick={() => { setDescriptionFrame(frame); setDescription(frame.description || ''); }}>
          <Text size="sm" c="dimmed" ta="center" lineClamp={3} className="hydro-frame-description">
            {frame.description || t('No description yet.')}
          </Text>
        </UnstyledButton>
      </Card>)}
    </SimpleGrid>
    <Paginator page={args.page || 1} totalPages={args.pageCount || 1} />
    <HonorFrameGrantDialog
      opened={grantOpened}
      onClose={() => setGrantOpened(false)}
      busy={busy}
      onGrant={(id, uids) => run({ operation: 'owners', id, uids, action: 'grant' })} />
    <FormDialog
      opened={!!descriptionFrame}
      onClose={() => setDescriptionFrame(null)}
      title={t('Edit description')}
      fields={[]}
      loading={busy}
      onSubmit={async () => {
        if (descriptionFrame && await run({ operation: 'description', id: descriptionFrame.id, description })) setDescriptionFrame(null);
      }}>
      <Textarea
        label={t('Frame description')}
        value={description}
        onChange={(event) => setDescription(event.currentTarget.value)}
        maxLength={2000}
        autosize
        minRows={4}
        maxRows={10}
        disabled={busy} />
    </FormDialog>
    <ConfirmDialog
      opened={!!deleting}
      onClose={() => setDeleting(null)}
      title={t('Delete frame')}
      message={t('Delete {name}? It will be removed from all users and cannot be restored.', { name: deleting?.name || '' })}
      loading={busy}
      confirmColor="red"
      onConfirm={async () => {
        if (deleting && await run({ operation: 'delete', id: deleting.id })) setDeleting(null);
      }} />
    <ConfirmDialog
      opened={!!action}
      onClose={() => setAction(null)}
      title={t(action?.active ? 'Unpublish' : 'Publish')}
      message={t(action?.active ? 'Unpublish this frame? It will stop displaying for all users.' : 'Publish this frame so it can be awarded?')}
      loading={busy}
      confirmColor={action?.active ? 'red' : 'green'}
      onConfirm={async () => {
        if (action && await run({ operation: 'status', id: action.id, active: !action.active })) setAction(null);
      }} />
  </Stack>;
}
