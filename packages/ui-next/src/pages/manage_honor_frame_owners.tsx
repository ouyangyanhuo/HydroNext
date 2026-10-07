import { Badge, Card, Checkbox, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { HonorFramePreview } from '@/components/user/honor-frame-preview';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useHonorFrameMutation } from '@/hooks/use-honor-frame-mutation';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';

interface Owner { _id: number, uname: string, avatar: string, equipped: boolean }
type Action = 'revoke' | 'equip' | 'unequip';
const labels = { revoke: 'Revoke frame', equip: 'Equip frame', unequip: 'Unequip frame' };
export default function HonorFrameOwnersPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const isAdmin = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const { busy, run } = useHonorFrameMutation();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const owners: Owner[] = args.owners || [];
  const frame = args.frame;
  const [selected, setSelected] = useState<number[]>([]);
  const [q, setQ] = useState(args.q || '');
  const [action, setAction] = useState<{ type: Action, uids: number[] } | null>(null);
  // Never carry an invisible selection into the next page/search result.
  const visible = selected.filter((uid) => owners.some((owner) => owner._id === uid));
  const actions = (uids: number[]) => <Group gap={6}>
    {(['equip', 'unequip', 'revoke'] as const).map((type) => <Button
      key={type}
      size="xs"
      variant="light"
      color={type === 'revoke' ? 'red' : undefined}
      disabled={busy || !uids.length || (type === 'equip' && !frame.active)}
      onClick={() => setAction({ type, uids })}>{t(labels[type])}</Button>)}
  </Group>;
  if (!isAdmin) return <Text>{t('Access Denied')}</Text>;
  return <Stack gap="lg">
    <PageHeader title={t('Frame owners')}><Button component={Link} to="manage_honor_frames" variant="subtle">{t('Back')}</Button></PageHeader>
    <Card withBorder p="lg" className="hydro-content-card"><Group gap="xl">
      <HonorFramePreview frame={frame} size={48} />
      <Stack gap={6}><Text fw={700}>{frame.name}</Text><Text size="sm" c="dimmed">{t('Owners')}: {args.count || 0}</Text>
        <Text size="sm" className="hydro-frame-description">{frame.description || t('No description yet.')}</Text>
        <Text size="xs" c="dimmed">{t('Equipping replaces the current frame. Unequipping keeps ownership; revoking removes it.')}</Text></Stack>
    </Group></Card>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      setSelected([]);
      void navigate(buildUrl('manage_honor_frame_owners', { id: frame.id }, { q: q.trim() }));
    }}><Group><TextInput
        className="flex-1"
        value={q}
        maxLength={80}
        placeholder={t('Search by username or user ID')}
        aria-label={t('Search by username or user ID')}
        onChange={(event) => setQ(event.currentTarget.value)} />
      <Button type="submit" variant="light" disabled={busy}>{t('Search')}</Button></Group></form>
    <Card withBorder p="lg" className="hydro-content-card">
      <Group justify="space-between" mb="lg">
        <Checkbox
          label={`${t('Select current page')} (${visible.length})`}
          disabled={busy || !owners.length}
          checked={!!owners.length && visible.length === owners.length}
          indeterminate={!!visible.length && visible.length < owners.length}
          onChange={(event) => setSelected(event.currentTarget.checked ? owners.map((owner) => owner._id) : [])} />
        {actions(visible)}
      </Group>
      <Stack gap="sm">{owners.map((owner) => <Group key={owner._id} justify="space-between" className="hydro-frame-owner-row">
        <Group gap="sm">
          <Checkbox
            aria-label={`${t('Select')} ${owner.uname}`}
            disabled={busy}
            checked={visible.includes(owner._id)}
            onChange={(event) => setSelected(event.currentTarget.checked ? [...visible, owner._id] : visible.filter((uid) => uid !== owner._id))} />
          <UserAvatar user={{ ...owner, honorFrame: owner.equipped ? frame : null }} size={36} />
          <Stack gap={2}>
            <Link to="user_detail" params={{ uid: owner._id }}>{owner.uname}</Link>
            <Text size="xs" c="dimmed">UID {owner._id}</Text>
          </Stack>
          {owner.equipped && <Badge color="green" variant="light">{t('Equipped')}</Badge>}
        </Group>{actions([owner._id])}
      </Group>)}</Stack>
      {!owners.length && <Text ta="center" c="dimmed" py="xl">{t('No users found')}</Text>}
    </Card>
    <Paginator page={args.page || 1} totalPages={args.pageCount || 1} />
    <ConfirmDialog
      opened={!!action}
      onClose={() => setAction(null)}
      loading={busy}
      title={t(action ? labels[action.type] : 'Confirm')}
      confirmColor={action?.type === 'revoke' ? 'red' : 'hydroTeal'}
      message={t('Apply this action to {count} selected users?', { count: action?.uids.length || 0 })}
      onConfirm={async () => {
        if (action && await run({ operation: 'owners', id: frame.id, uids: action.uids, action: action.type })) {
          setAction(null); setSelected([]);
        }
      }} />
  </Stack>;
}
