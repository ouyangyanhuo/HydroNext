import {
  Badge, Card, Divider, Grid, Group, Modal, Paper, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft, IconCopy, IconCrown, IconEdit, IconInfoCircle, IconKey, IconLogout, IconPlus, IconRefresh, IconTrash,
  IconUserPlus, IconUsers,
} from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { copyCodeText } from '@/components/markdown/code-copy';
import { UserAvatar } from '@/components/user/user-avatar';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';

interface RenameModalState { vuid: number, name: string }
interface RemoveMemberState { vuid: number, uid: number, uname: string }

export default function ContestTeamPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const currentUser = useSessionStore((s) => s.user);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [resetting, setResetting] = useState<number | null>(null);
  const [renameModal, setRenameModal] = useState<RenameModalState | null>(null);
  const [removingMember, setRemovingMember] = useState<RemoveMemberState | null>(null);
  const pending = useRef(false);
  const udict = args.udict || {};
  const mine = args.mine || [];

  const post = async (payload: Record<string, any>) => {
    if (pending.current) return false;
    pending.current = true;
    setLoading(true);
    try {
      const response = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(formatErrorMessage({ ...data.error, message: t(data.error?.message || 'Failed') }, t('Failed')));
      }
      if (data.url || data.redirect) {
        const target = new URL(data.url || data.redirect, window.location.href);
        if (target.origin !== window.location.origin) throw new Error(t('Failed'));
        if (target.pathname !== window.location.pathname || target.search !== window.location.search) {
          await navigate(target.pathname + target.search + target.hash);
          return false;
        }
      }
      notifications.show({ title: t('Saved'), message: '', color: 'green' });
      await navigate(window.location.pathname + window.location.search);
      return true;
    } catch (error: any) {
      notifications.show({ title: t('Failed'), message: error.message || t('Network error'), color: 'red' });
      return false;
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  const renameTeam = async () => {
    if (!renameModal?.name.trim()) return;
    if (await post({ operation: 'rename', vuid: renameModal.vuid, name: renameModal.name.trim() })) setRenameModal(null);
  };

  const copyInvitation = async (value: string) => {
    try {
      await copyCodeText(value, document);
      notifications.show({ message: t('Copied'), color: 'green' });
    } catch {
      notifications.show({ message: t('Copy failed'), color: 'red' });
    }
  };

  const instructions = t('Create a team and share its invitation code. Teammates enter the code to join; no private messages are needed.');
  const postInstructions = t('After joining, select Team Participation when registering for a contest that allows teams.');

  return (
    <Stack gap="lg">
      <PageHeader title={t('My Teams')}>
        <Button component={Link} to="contest_main" variant="subtle" leftSection={<IconArrowLeft size={16} />}>
          {t('Back')}
        </Button>
      </PageHeader>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            {mine.length === 0 && (
              <Card withBorder p="xl" className="hydro-content-card" ta="center">
                <Stack align="center" gap="sm" py="md">
                  <ThemeIcon size={56} radius="xl" variant="light"><IconUsers size={32} /></ThemeIcon>
                  <Title order={4}>{t('You are not in any team yet.')}</Title>
                  <Text c="dimmed" size="sm" maw={440}>{instructions}</Text>
                </Stack>
              </Card>
            )}
            {mine.map((team: any) => {
              const captainId = team.captainId;
              const canManage = team.canManage === true && captainId === currentUser._id;
              const canLeave = team.canLeave !== false;
              const members = team.members || [];
              return (
                <Card key={team._id} withBorder p="lg" className="hydro-content-card">
                  <Stack gap="md">
                    <Group justify="space-between" wrap="wrap" gap="sm">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <ThemeIcon size="lg" radius="xl" variant="light"><IconUsers size={20} /></ThemeIcon>
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Text fw="var(--hydro-weight-semibold)" size="lg" truncate>{team.displayName}</Text>
                          <Group gap="xs">
                            <Badge variant="outline" size="xs">ID: {team._id}</Badge>
                            <Badge variant="light" size="xs">{members.length} {t('Members')}</Badge>
                          </Group>
                        </Stack>
                      </Group>
                      <Group gap="xs">
                        {canManage && <Button
                          size="xs"
                          variant="light"
                          disabled={loading}
                          leftSection={<IconEdit size={14} />}
                          onClick={() => setRenameModal({ vuid: team._id, name: team.displayName })}
                        >{t('Rename')}</Button>}
                        <Tooltip disabled={canLeave} label={t('The captain must remove other members before leaving the team.')}>
                          <span>
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              disabled={loading || !canLeave}
                              leftSection={<IconLogout size={14} />}
                              onClick={() => setLeaving(team._id)}
                            >{t('Leave Team')}</Button>
                          </span>
                        </Tooltip>
                      </Group>
                    </Group>
                    <Paper withBorder p="sm" radius="md" bg="var(--hydro-surface-muted)">
                      <Group justify="space-between" gap="sm" wrap="wrap">
                        <Stack gap={3}>
                          <Text c="dimmed" size="xs">{t('Team invitation code')}</Text>
                          <Text ff="monospace" fw="var(--hydro-weight-semibold)" size="lg" style={{ letterSpacing: '0.12em' }}>
                            {team.invitationCode}
                          </Text>
                        </Stack>
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconCopy size={14} />}
                            disabled={!team.invitationCode}
                            onClick={() => copyInvitation(team.invitationCode)}
                          >{t('Copy')}</Button>
                          {canManage && <Tooltip label={t('Reset team invitation code')}>
                            <ActionIcon
                              variant="subtle"
                              disabled={loading}
                              aria-label={t('Reset team invitation code')}
                              onClick={() => setResetting(team._id)}
                            ><IconRefresh size={16} /></ActionIcon>
                          </Tooltip>}
                        </Group>
                      </Group>
                    </Paper>
                    <Divider />
                    <Stack gap="xs">
                      <Text size="xs" fw="var(--hydro-weight-semibold)" c="dimmed">{t('Members')} ({members.length})</Text>
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                        {members.map((uid: number) => {
                          const u = udict[uid] || { _id: uid, uname: String(uid) };
                          const isSelf = uid === currentUser._id;
                          return (
                            <Paper key={uid} withBorder p="xs" radius="md">
                              <Group justify="space-between" wrap="nowrap" gap="xs">
                                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                                  <UserAvatar user={u} size={32} />
                                  <Stack gap={2} style={{ minWidth: 0 }}>
                                    <UserLink user={u} size="sm" />
                                    <Group gap={4}>
                                      {uid === captainId && (
                                        <Badge size="xs" color="yellow" variant="light" leftSection={<IconCrown size={10} />}>
                                          {t('Leader')}
                                        </Badge>
                                      )}
                                      {isSelf && <Badge size="xs" variant="light">{t('You')}</Badge>}
                                    </Group>
                                  </Stack>
                                </Group>
                                {canManage && !isSelf && uid !== captainId && (
                                  <Tooltip label={t('Remove this member from the team?')}>
                                    <ActionIcon
                                      size="sm"
                                      color="red"
                                      variant="subtle"
                                      disabled={loading}
                                      aria-label={t('Remove Member')}
                                      onClick={() => setRemovingMember({ vuid: team._id, uid, uname: u.displayName || u.uname || String(uid) })}
                                    ><IconTrash size={14} /></ActionIcon>
                                  </Tooltip>
                                )}
                              </Group>
                            </Paper>
                          );
                        })}
                      </SimpleGrid>
                    </Stack>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="lg">
            <Card withBorder p="lg" className="hydro-content-card">
              <form onSubmit={async (event) => {
                event.preventDefault();
                if (code.trim().length === 8 && await post({ operation: 'join', code: code.trim() })) setCode('');
              }}>
                <Stack gap="md">
                  <Group gap="xs">
                    <ThemeIcon variant="light"><IconUserPlus size={16} /></ThemeIcon>
                    <Title order={4}>{t('Join a Team')}</Title>
                  </Group>
                  <TextInput
                    label={t('Team invitation code')}
                    placeholder={t('Enter the 8-character team invitation code')}
                    value={code}
                    onChange={(event) => setCode(event.currentTarget.value.toUpperCase())}
                    maxLength={8}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={loading}
                    required
                    leftSection={<IconKey size={16} />}
                  />
                  <Button type="submit" fullWidth loading={loading} disabled={code.trim().length !== 8}>{t('Join a Team')}</Button>
                </Stack>
              </form>
            </Card>
            <Card withBorder p="lg" className="hydro-content-card">
              <form onSubmit={async (event) => {
                event.preventDefault();
                if (name.trim() && await post({ operation: 'create', name: name.trim() })) setName('');
              }}>
                <Stack gap="md">
                  <Group gap="xs">
                    <ThemeIcon variant="light"><IconPlus size={16} /></ThemeIcon>
                    <Title order={4}>{t('Create a Team')}</Title>
                  </Group>
                  <TextInput
                    label={t('Team name')}
                    placeholder={t('Team name')}
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                    disabled={loading}
                    required
                  />
                  <Button type="submit" fullWidth variant="light" loading={loading} disabled={!name.trim()}>{t('Create')}</Button>
                </Stack>
              </form>
            </Card>
            <Card withBorder p="lg" className="hydro-content-card">
              <Stack gap="sm">
                <Group gap="xs"><IconInfoCircle size={18} /><Title order={4}>{t('How It Works')}</Title></Group>
                <Text size="sm" c="dimmed">{instructions}</Text>
                <Text size="sm" c="dimmed">{postInstructions}</Text>
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
      <Modal
        opened={renameModal !== null}
        onClose={() => { if (!loading) setRenameModal(null); }}
        title={t('Rename')}
        size="sm"
        closeOnClickOutside={!loading}
        closeOnEscape={!loading}
        closeButtonProps={{ disabled: loading }}
      >
        <form onSubmit={async (event) => { event.preventDefault(); await renameTeam(); }}>
          <Stack gap="md">
            <TextInput
              label={t('Team name')}
              value={renameModal?.name || ''}
              required
              autoFocus
              disabled={loading}
              onChange={(event) => {
                if (renameModal) setRenameModal({ ...renameModal, name: event.currentTarget.value });
              }}
            />
            <Group justify="flex-end" gap="xs">
              <Button variant="default" size="xs" onClick={() => setRenameModal(null)} disabled={loading}>{t('Cancel')}</Button>
              <Button type="submit" size="xs" loading={loading} disabled={!renameModal?.name.trim()}>{t('Save')}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <ConfirmDialog
        opened={resetting !== null}
        onClose={() => setResetting(null)}
        title={t('Reset team invitation code')}
        message={t('Resetting invalidates the old invitation code immediately. Existing members are not affected.')}
        loading={loading}
        onConfirm={async () => {
          if (resetting !== null && await post({ operation: 'reset_code', vuid: resetting })) setResetting(null);
        }}
      />
      <ConfirmDialog
        opened={leaving !== null}
        onClose={() => setLeaving(null)}
        title={t('Leave Team')}
        message={t('Leave this team? You may lose access to team contests.')}
        loading={loading}
        onConfirm={async () => { if (leaving !== null && await post({ operation: 'leave', vuid: leaving })) setLeaving(null); }}
      />
      <ConfirmDialog
        opened={removingMember !== null}
        onClose={() => setRemovingMember(null)}
        title={t('Remove Member')}
        message={t('Remove this member from the team?')}
        confirmColor="red"
        loading={loading}
        onConfirm={async () => {
          if (removingMember && await post({ operation: 'leave', vuid: removingMember.vuid, uid: removingMember.uid })) setRemovingMember(null);
        }}
      />
    </Stack>
  );
}
