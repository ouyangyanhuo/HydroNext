import {
  ActionIcon,
  Badge,
  Card,
  Divider,
  Grid,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconCrown,
  IconEdit,
  IconInfoCircle,
  IconLogout,
  IconMail,
  IconPlus,
  IconTrash,
  IconTrophy,
  IconUserPlus,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { UserAvatar } from '@/components/user/user-avatar';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';

interface RenameModalState {
  vuid: number;
  name: string;
}

interface InviteModalState {
  vuid: number;
  teamName: string;
  input: string;
}

interface RemoveMemberState {
  vuid: number;
  uid: number;
  uname: string;
}

function getTeamCreatorId(team: any): number {
  if (typeof team?.uname === 'string') {
    const match = team.uname.match(/^team:(\d+):/);
    if (match) return Number(match[1]);
  }
  return team?.members?.[0] || 0;
}

export default function ContestTeamPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const currentUser = useSessionStore((s) => s.user);

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [renameModal, setRenameModal] = useState<RenameModalState | null>(null);
  const [inviteModal, setInviteModal] = useState<InviteModalState | null>(null);
  const [removingMember, setRemovingMember] = useState<RemoveMemberState | null>(null);
  const pending = useRef(false);

  const udict = args.udict || {};
  const mine = args.mine || [];
  const invites = args.invites || [];

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
        throw new Error(formatErrorMessage(data.error, t('Failed')));
      }
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

  const createTeam = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await post({ operation: 'create', name: trimmed })) {
      setName('');
    }
  };

  const renameTeam = async () => {
    if (!renameModal) return;
    const trimmed = renameModal.name.trim();
    if (!trimmed) return;
    if (await post({ operation: 'rename', vuid: renameModal.vuid, name: trimmed })) {
      setRenameModal(null);
    }
  };

  const inviteMember = async () => {
    if (!inviteModal) return;
    const trimmed = inviteModal.input.trim();
    if (!trimmed) return;
    if (await post({ operation: 'invite', vuid: inviteModal.vuid, uidOrName: trimmed })) {
      setInviteModal(null);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('My Teams')}>
        <Button
          component={Link}
          to="contest_main"
          variant="subtle"
          leftSection={<IconTrophy size={16} />}
        >
          {t('Contests')}
        </Button>
      </PageHeader>

      <Text c="dimmed" size="sm">
        {t('Teams let multiple users participate in a contest together, sharing one set of submissions.')}
      </Text>

      {invites.length > 0 && (
        <Card
          withBorder
          p="md"
          className="hydro-content-card"
          style={{ borderColor: 'var(--mantine-color-blue-filled)' }}
        >
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap="xs">
                <ThemeIcon color="blue" variant="light" size="md" radius="xl">
                  <IconMail size={16} />
                </ThemeIcon>
                <Text fw="var(--hydro-weight-semibold)" size="sm">
                  {t('You have {0} pending team invite(s)', invites.length)}
                </Text>
              </Group>
              <Badge color="blue" variant="light" size="sm">
                {invites.length}
              </Badge>
            </Group>
            <Divider />
            <Stack gap="xs">
              {invites.map((team: any) => {
                const teamMembers = team.members || [];
                return (
                  <Paper key={team._id} withBorder p="sm" radius="md">
                    <Group justify="space-between" wrap="wrap" gap="sm">
                      <Stack gap={4}>
                        <Group gap="xs">
                          <Text fw="var(--hydro-weight-semibold)" size="sm">{team.displayName}</Text>
                          <Badge variant="outline" size="xs">ID: {team._id}</Badge>
                        </Group>
                        {teamMembers.length > 0 && (
                          <Group gap="xs" align="center">
                            <Text size="xs" c="dimmed">{t('Members')}:</Text>
                            <Group gap={6} wrap="wrap">
                              {teamMembers.map((uid: number) => {
                                const u = udict[uid] || { _id: uid, uname: String(uid) };
                                return (
                                  <Group key={uid} gap={4} wrap="nowrap">
                                    <UserAvatar user={u} size={20} />
                                    <UserLink user={u} size="xs" />
                                  </Group>
                                );
                              })}
                            </Group>
                          </Group>
                        )}
                      </Stack>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          color="green"
                          disabled={loading}
                          leftSection={<IconCheck size={14} />}
                          onClick={() => post({ operation: 'accept', vuid: team._id })}
                        >
                          {t('Accept')}
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          disabled={loading}
                          leftSection={<IconX size={14} />}
                          onClick={() => post({ operation: 'reject', vuid: team._id })}
                        >
                          {t('Reject')}
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          </Stack>
        </Card>
      )}

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <Title order={3}>{t('My Teams')}</Title>
                <Badge variant="light" size="md">{mine.length}</Badge>
              </Group>
            </Group>

            {mine.length === 0 && (
              <Card withBorder p="xl" className="hydro-content-card" ta="center">
                <Stack align="center" gap="sm" py="md">
                  <ThemeIcon size={56} radius="xl" variant="light" color="gray">
                    <IconUsers size={32} />
                  </ThemeIcon>
                  <Title order={4}>{t('You are not in any team yet.')}</Title>
                  <Text c="dimmed" size="sm" maw={440}>
                    {t(
                      'Create a team, invite teammates by their username, then choose '
                      + '"Team Participation" when attending an allow-team contest.',
                    )}
                  </Text>
                </Stack>
              </Card>
            )}

            {mine.map((team: any) => {
              const creatorId = getTeamCreatorId(team);
              const members = team.members || [];
              const teamInvites = team.invite || [];

              return (
                <Card key={team._id} withBorder p="lg" className="hydro-content-card">
                  <Stack gap="md">
                    <Group justify="space-between" wrap="wrap" gap="sm">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <ThemeIcon size="lg" radius="xl" variant="light" color="indigo">
                          <IconUsers size={20} />
                        </ThemeIcon>
                        <Stack gap={2} style={{ minWidth: 0 }}>
                          <Text fw="var(--hydro-weight-semibold)" size="lg" truncate>
                            {team.displayName}
                          </Text>
                          <Group gap="xs">
                            <Badge variant="outline" size="xs">ID: {team._id}</Badge>
                            <Badge variant="light" size="xs" leftSection={<IconUsers size={12} />}>
                              {members.length} {t('Members')}
                            </Badge>
                          </Group>
                        </Stack>
                      </Group>
                      <Group gap="xs" wrap="wrap">
                        <Button
                          size="xs"
                          variant="light"
                          disabled={loading}
                          leftSection={<IconEdit size={14} />}
                          onClick={() => setRenameModal({ vuid: team._id, name: team.displayName })}
                        >
                          {t('Rename')}
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          disabled={loading}
                          leftSection={<IconUserPlus size={14} />}
                          onClick={() => setInviteModal({
                            vuid: team._id,
                            teamName: team.displayName,
                            input: '',
                          })}
                        >
                          {t('Invite Member')}
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          disabled={loading}
                          leftSection={<IconLogout size={14} />}
                          onClick={() => setLeaving(team._id)}
                        >
                          {t('Leave Team')}
                        </Button>
                      </Group>
                    </Group>

                    <Divider />

                    <Stack gap="xs">
                      <Text size="xs" fw="var(--hydro-weight-semibold)" c="dimmed" tt="uppercase">
                        {t('Members')} ({members.length})
                      </Text>
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                        {members.map((uid: number) => {
                          const u = udict[uid] || { _id: uid, uname: String(uid) };
                          const isCreator = uid === creatorId;
                          const isSelf = uid === currentUser._id;

                          return (
                            <Paper key={uid} withBorder p="xs" radius="md">
                              <Group justify="space-between" wrap="nowrap" gap="xs">
                                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                                  <UserAvatar user={u} size={32} />
                                  <Stack gap={2} style={{ minWidth: 0 }}>
                                    <UserLink user={u} size="sm" />
                                    <Group gap={4} wrap="wrap">
                                      {isCreator && (
                                        <Badge
                                          size="xs"
                                          color="yellow"
                                          variant="light"
                                          leftSection={<IconCrown size={10} />}
                                        >
                                          {t('Leader')}
                                        </Badge>
                                      )}
                                      {isSelf && (
                                        <Badge size="xs" color="blue" variant="light">
                                          {t('You')}
                                        </Badge>
                                      )}
                                    </Group>
                                  </Stack>
                                </Group>
                                {!isSelf && (
                                  <Tooltip label={t('Remove this member from the team?')}>
                                    <ActionIcon
                                      size="sm"
                                      color="red"
                                      variant="subtle"
                                      disabled={loading}
                                      onClick={() => setRemovingMember({
                                        vuid: team._id,
                                        uid,
                                        uname: u.displayName || u.uname || String(uid),
                                      })}
                                    >
                                      <IconTrash size={14} />
                                    </ActionIcon>
                                  </Tooltip>
                                )}
                              </Group>
                            </Paper>
                          );
                        })}
                      </SimpleGrid>
                    </Stack>

                    {teamInvites.length > 0 && (
                      <>
                        <Divider />
                        <Stack gap="xs">
                          <Text size="xs" fw="var(--hydro-weight-semibold)" c="dimmed" tt="uppercase">
                            {t('Pending Invites')} ({teamInvites.length})
                          </Text>
                          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                            {teamInvites.map((uid: number) => {
                              const u = udict[uid] || { _id: uid, uname: String(uid) };
                              return (
                                <Paper key={uid} withBorder p="xs" radius="md">
                                  <Group justify="space-between" wrap="nowrap" gap="xs">
                                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                                      <UserAvatar user={u} size={28} />
                                      <Stack gap={2} style={{ minWidth: 0 }}>
                                        <UserLink user={u} size="sm" />
                                        <Badge size="xs" color="orange" variant="light">
                                          {t('Invited')}
                                        </Badge>
                                      </Stack>
                                    </Group>
                                    <Button
                                      size="xs"
                                      variant="subtle"
                                      color="red"
                                      disabled={loading}
                                      leftSection={<IconX size={12} />}
                                      onClick={() => post({ operation: 'leave', vuid: team._id, uid })}
                                    >
                                      {t('Revoke')}
                                    </Button>
                                  </Group>
                                </Paper>
                              );
                            })}
                          </SimpleGrid>
                        </Stack>
                      </>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="lg">
            <Card withBorder p="lg" className="hydro-content-card">
              <Stack gap="md">
                <Group gap="xs">
                  <ThemeIcon size="md" radius="md" variant="light" color="blue">
                    <IconPlus size={16} />
                  </ThemeIcon>
                  <Title order={4}>{t('Create a Team')}</Title>
                </Group>
                <TextInput
                  label={t('Team name')}
                  placeholder={t('Team name')}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') await createTeam();
                  }}
                  disabled={loading}
                />
                <Button
                  fullWidth
                  disabled={loading || !name.trim()}
                  leftSection={<IconCheck size={16} />}
                  onClick={createTeam}
                >
                  {t('Create')}
                </Button>
              </Stack>
            </Card>

            <Card withBorder p="lg" className="hydro-content-card">
              <Stack gap="md">
                <Group gap="xs">
                  <ThemeIcon size="md" radius="md" variant="light" color="indigo">
                    <IconInfoCircle size={16} />
                  </ThemeIcon>
                  <Title order={4}>{t('How It Works')}</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  {t('Teams let multiple users participate in a contest together, sharing one set of submissions.')}
                </Text>
                <Text size="sm" c="dimmed">
                  {t(
                    'Create a team, invite teammates by their username, then choose '
                    + '"Team Participation" when attending an allow-team contest.',
                  )}
                </Text>
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
      >
        <Stack gap="md">
          <TextInput
            label={t('Team name')}
            value={renameModal?.name || ''}
            onChange={(e) => {
              if (renameModal) setRenameModal({ ...renameModal, name: e.currentTarget.value });
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') await renameTeam();
            }}
            disabled={loading}
            autoFocus
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              size="xs"
              onClick={() => setRenameModal(null)}
              disabled={loading}
            >
              {t('Cancel')}
            </Button>
            <Button
              size="xs"
              disabled={loading || !renameModal?.name.trim()}
              onClick={renameTeam}
            >
              {t('Save')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={inviteModal !== null}
        onClose={() => { if (!loading) setInviteModal(null); }}
        title={t('Invite Member')}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {inviteModal?.teamName}
          </Text>
          <TextInput
            label={t('Username / UID')}
            placeholder={t('Username / UID')}
            value={inviteModal?.input || ''}
            onChange={(e) => {
              if (inviteModal) setInviteModal({ ...inviteModal, input: e.currentTarget.value });
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') await inviteMember();
            }}
            disabled={loading}
            autoFocus
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              size="xs"
              onClick={() => setInviteModal(null)}
              disabled={loading}
            >
              {t('Cancel')}
            </Button>
            <Button
              size="xs"
              disabled={loading || !inviteModal?.input.trim()}
              onClick={inviteMember}
            >
              {t('Invite Member')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ConfirmDialog
        opened={leaving !== null}
        onClose={() => setLeaving(null)}
        title={t('Leave Team')}
        message={t('Leave this team? You may lose access to team contests.')}
        loading={loading}
        onConfirm={async () => {
          if (leaving && await post({ operation: 'leave', vuid: leaving })) setLeaving(null);
        }}
      />

      <ConfirmDialog
        opened={removingMember !== null}
        onClose={() => setRemovingMember(null)}
        title={t('Remove Member')}
        message={t('Remove this member from the team?')}
        confirmColor="red"
        loading={loading}
        onConfirm={async () => {
          if (removingMember && await post({
            operation: 'leave',
            vuid: removingMember.vuid,
            uid: removingMember.uid,
          })) {
            setRemovingMember(null);
          }
        }}
      />
    </Stack>
  );
}
