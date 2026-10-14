import { Card, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

export default function ContestTeamPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [invites, setInvites] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const pending = useRef(false);
  const udict = args.udict || {};

  const post = async (payload: Record<string, any>) => {
    if (pending.current) return false;
    pending.current = true;
    setLoading(true);
    try {
      const response = await fetch(window.location.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed')));
      notifications.show({ title: t('Saved'), message: '', color: 'green' });
      await navigate(window.location.pathname + window.location.search);
      return true;
    } catch (error: any) {
      notifications.show({ title: t('Failed'), message: error.message, color: 'red' });
      return false;
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('My Teams')}>
        <Button component={Link} to="contest_main" variant="subtle">{t('Contests')}</Button>
      </PageHeader>
      <Text c="dimmed">{t('Teams let multiple users participate in a contest together, sharing one set of submissions.')}</Text>
      <Card withBorder>
        <Title order={3} mb="sm">{t('Create a Team')}</Title>
        <Group align="end">
          <TextInput label={t('Team name')} value={name} onChange={(event) => setName(event.currentTarget.value)} disabled={loading} />
          <Button
            disabled={loading || !name.trim()}
            onClick={async () => {
              if (await post({ operation: 'create', name: name.trim() })) setName('');
            }}>{t('Create')}</Button>
        </Group>
      </Card>
      {(args.mine || []).length === 0 && <Text c="dimmed">{t('You are not in any team.')}</Text>}
      {(args.mine || []).map((team: any) => (
        <Card key={team._id} withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={3}>{team.displayName}</Title>
              <Button variant="light" color="red" disabled={loading} onClick={() => setLeaving(team._id)}>{t('Leave Team')}</Button>
            </Group>
            <Group>
              <Text size="sm" fw={600}>{t('Members')}</Text>
              {(team.members || []).map((uid: number) => <UserLink key={uid} user={udict[uid] || { _id: uid, uname: String(uid) }} />)}
            </Group>
            <Group align="end">
              <TextInput
                label={t('Rename')}
                value={renames[team._id] ?? team.displayName}
                onChange={(event) => setRenames({ ...renames, [team._id]: event.currentTarget.value })}
                disabled={loading} />
              <Button
                variant="light"
                disabled={loading || !renames[team._id]?.trim()}
                onClick={() => post({ operation: 'rename', vuid: team._id, name: renames[team._id].trim() })}>{t('Save')}</Button>
              <TextInput
                label={t('Username / UID')}
                value={invites[team._id] || ''}
                onChange={(event) => setInvites({ ...invites, [team._id]: event.currentTarget.value })}
                disabled={loading} />
              <Button
                disabled={loading || !invites[team._id]?.trim()}
                onClick={async () => {
                  if (await post({ operation: 'invite', vuid: team._id, uidOrName: invites[team._id].trim() })) {
                    setInvites({ ...invites, [team._id]: '' });
                  }
                }}>{t('Invite Member')}</Button>
            </Group>
            {(team.invite || []).map((uid: number) => (
              <Group key={uid}>
                <Text size="sm">{t('Pending Invites')}</Text>
                <UserLink user={udict[uid] || { _id: uid, uname: String(uid) }} />
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={loading}
                  onClick={() => post({ operation: 'leave', vuid: team._id, uid })}>{t('Revoke')}</Button>
              </Group>
            ))}
          </Stack>
        </Card>
      ))}
      {(args.invites || []).length > 0 && <Title order={3}>{t('Pending Invites')}</Title>}
      {(args.invites || []).map((team: any) => (
        <Card key={team._id} withBorder>
          <Group justify="space-between">
            <Text fw={600}>{team.displayName}</Text>
            <Group>
              <Button disabled={loading} onClick={() => post({ operation: 'accept', vuid: team._id })}>{t('Accept')}</Button>
              <Button variant="light" disabled={loading} onClick={() => post({ operation: 'reject', vuid: team._id })}>{t('Reject')}</Button>
            </Group>
          </Group>
        </Card>
      ))}
      <ConfirmDialog
        opened={leaving !== null}
        onClose={() => setLeaving(null)}
        title={t('Leave Team')}
        message={t('Leave this team? You may lose access to team contests.')}
        loading={loading}
        onConfirm={async () => { if (await post({ operation: 'leave', vuid: leaving })) setLeaving(null); }} />
    </Stack>
  );
}
