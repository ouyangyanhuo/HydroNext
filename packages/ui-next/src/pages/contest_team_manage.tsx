import { Badge, Card, Group, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCornerDownLeft, IconEdit, IconSearch, IconTrash } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { DataTable } from '@/components/common/data-table';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { TeamIdentity } from '@/components/contest/team-identity';
import { Link } from '@/components/link';
import { UserAvatar } from '@/components/user/user-avatar';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

export default function ContestTeamManagePage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const [search, setSearch] = useState(args.q || '');
  const [rename, setRename] = useState<{ id: number, name: string } | null>(null);
  const [disband, setDisband] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const team = args.team;
  const udict = args.udict || {};
  const act = async (operation: string, vuid: number, name?: string) => {
    if (pending.current) return false;
    pending.current = true;
    setLoading(true);
    try {
      const response = await fetch(buildUrl('contest_team_manage'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation, vuid, name }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed'), t));
      notifications.show({ message: t('Saved'), color: 'green' });
      await navigate(window.location.pathname + window.location.search);
      return true;
    } catch (error: any) {
      notifications.show({ message: error.message || t('Network error'), color: 'red' });
      return false;
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };
  const actions = (entry: any) => !entry.disbandedAt && <Group gap="xs">
    <Button
      size="xs"
      variant="light"
      disabled={loading}
      leftSection={<IconEdit size={14} />}
      onClick={() => setRename({ id: entry._id, name: entry.displayName })}>{t('Rename')}</Button>
    <Button
      size="xs"
      color="red"
      variant="subtle"
      disabled={loading}
      leftSection={<IconTrash size={14} />}
      onClick={() => setDisband(entry)}>{t('Disband team')}</Button>
  </Group>;
  const searchTeams = () => void navigate(buildUrl('contest_team_manage', {}, search.trim() ? { q: search.trim() } : {}));
  return <Stack gap="lg">
    <PageHeader title={team ? t('Team details') : t('Team management')}>
      <Group gap="xs" wrap="wrap">
        {!team && (
          <TextInput
            placeholder={t('Search teams...')}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') searchTeams(); }}
            leftSection={<IconSearch size={15} stroke={1.8} />}
            rightSection={(
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={searchTeams}
                aria-label={t('Search')}
                title={t('Search')}
              >
                <IconCornerDownLeft size={13} stroke={1.8} />
              </ActionIcon>
            )}
            rightSectionPointerEvents="auto"
            size="xs"
            className="w-[190px] sm:w-[260px]"
          />
        )}
        <Button
          component={Link}
          to={team ? 'contest_team_manage' : 'contest_team'}
          variant="subtle"
          size="xs"
          leftSection={<IconArrowLeft size={15} />}
        >
          {t('Back')}
        </Button>
      </Group>
    </PageHeader>
    <Text size="sm" c="dimmed">
      {t('Teams belong only to this domain. Existing contest registrations and results are preserved when a team is disbanded.')}
    </Text>
    {team ? <>
      <Card withBorder p="lg" className="hydro-content-card">
        <Group justify="space-between" gap="md">
          <TeamIdentity id={team._id} name={team.displayName} members={team.members} udict={udict} />
          {team.disbandedAt ? <Badge color="red">{t('Disbanded')}</Badge> : actions(team)}
        </Group>
        {team.createdAt && <Text c="dimmed" size="xs" mt="md">{t('Created at')}: <TimeDisplay date={team.createdAt} format="absolute" /></Text>}
      </Card>
      <Card withBorder p="lg" className="hydro-content-card">
        <Title order={3} size="h4" mb="md">{t('Members')} ({team.members.length})</Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {team.members.map((uid: number) => {
            const memberUser = udict[uid];
            return (
              <Card key={uid} withBorder p="sm" className="hydro-panel">
                <Group wrap="nowrap" gap="sm">
                  <UserAvatar user={memberUser || { _id: uid }} size={38} />
                  <Stack gap={3}>
                    {memberUser?.uname || memberUser?.displayName
                      ? <UserLink user={memberUser} />
                      : <Text size="sm" c="dimmed">{t('Unknown')}</Text>}
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">UID {uid}</Text>
                      {uid === team.captainId && <Badge size="xs" color="yellow">{t('Leader')}</Badge>}
                    </Group>
                  </Stack>
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      </Card>
    </> : <Card withBorder p="md" className="hydro-content-card">
      <DataTable
        data={args.teams || []}
        emptyMessage={t('No teams in this domain.')}
        columns={[
          { key: 'name', title: t('Team name'), render: (entry: any) => <Link
            to="contest_team_detail"
            params={{ vuid: entry._id }}
            className="hydro-subtle-link">{entry.displayName}</Link> },
          { key: 'captain', title: t('Leader'), render: (entry: any) => {
            const captain = udict[entry.captainId];
            if (captain?.uname || captain?.displayName) {
              return <UserLink user={captain} />;
            }
            return <Text size="sm" c="dimmed">{t('Unknown')}</Text>;
          } },
          { key: 'members', title: t('Members'), render: (entry: any) => <Text size="sm">{entry.members.length}</Text> },
          { key: 'actions', title: t('Actions'), render: actions },
        ]} />
      <Paginator page={args.page || 1} totalPages={args.pageCount || 1} />
    </Card>}
    <FormDialog
      opened={rename !== null}
      onClose={() => setRename(null)}
      title={t('Rename')}
      fields={[]}
      loading={loading}
      onSubmit={async () => { if (rename?.name.trim() && await act('rename', rename.id, rename.name.trim())) setRename(null); }}>
      <TextInput
        label={t('Team name')}
        value={rename?.name || ''}
        maxLength={80}
        required
        autoFocus
        onChange={(event) => { if (rename) setRename({ ...rename, name: event.currentTarget.value }); }} />
    </FormDialog>
    <ConfirmDialog
      opened={disband !== null}
      onClose={() => setDisband(null)}
      title={t('Disband team')}
      confirmColor="red"
      loading={loading}
      message={t('Disband this team? Its invitation code will be invalidated. Existing contest registrations and results will be retained.')}
      onConfirm={async () => { if (disband && await act('disband', disband._id)) setDisband(null); }} />
  </Stack>;
}
