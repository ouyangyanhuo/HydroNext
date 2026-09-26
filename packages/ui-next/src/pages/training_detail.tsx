import {
  Avatar, Badge, Button, Card, Center, Group, Loader, Modal, Pagination, Progress, SimpleGrid, Stack, Table, Text,
  TextInput, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconChevronRight, IconSearch, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { DeleteResourceButton } from '@/components/common/delete-resource-button';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { UserLink } from '@/components/user/user-link';
import { usePageData, useUserContext } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';
import { isTrainingEnrolled } from '@/utils/training';
import { formatUserName } from '@/utils/user-name';

function getNodes(tdoc: any) {
  if (Array.isArray(tdoc.dag)) return tdoc.dag;
  if (Array.isArray(tdoc.sections)) {
    return tdoc.sections.map((section: any, index: number) => ({
      ...section,
      _id: section._id ?? index + 1,
      title: section.title,
      content: section.content || section.description,
    }));
  }
  return [];
}

function getPids(tdoc: any) {
  return getNodes(tdoc).flatMap((node: any) => node.pids || []);
}

function difficulty(problem: any) {
  if (problem?.difficulty !== undefined && problem?.difficulty !== null) return problem.difficulty;
  const submit = Number(problem?.nSubmit || 0);
  const accept = Number(problem?.nAccept || 0);
  if (!submit) return '-';
  return `${Math.round((accept / submit) * 100)}%`;
}

function nodeStatus(nodeState: any, enrolled: boolean) {
  if (!enrolled) return { label: 'Not Enrolled', color: 'gray' };
  if (nodeState?.isDone) return { label: 'Completed', color: 'green' };
  if (nodeState?.isProgress) return { label: 'In Progress', color: 'blue' };
  if (nodeState?.isOpen) return { label: 'Open', color: 'teal' };
  if (nodeState?.isInvalid) return { label: 'Invalid', color: 'red' };
  return { label: 'Open', color: 'teal' };
}

function TrainingProblemTable({
  node,
  pdict,
  psdict,
  selfPsdict,
  enrolled,
  compare,
  invalid,
  viewRecords,
  viewedUid,
}: {
  node: any;
  pdict: Record<string, any>;
  psdict: Record<string, any>;
  selfPsdict: Record<string, any>;
  enrolled: boolean;
  compare: boolean;
  invalid: boolean;
  viewRecords: boolean;
  viewedUid?: number;
}) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const pids = node.pids || [];

  return (
    <div className="overflow-x-auto">
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            {enrolled && <Table.Th className="w-28">{t('Status')}</Table.Th>}
            {compare && <Table.Th className="w-28">{t('My status')}</Table.Th>}
            <Table.Th>{t('Problem')}</Table.Th>
            <Table.Th className="w-24 text-right">{t('Tried')}</Table.Th>
            <Table.Th className="w-24 text-right">{t('AC')}</Table.Th>
            <Table.Th className="w-28 text-right">{t('Difficulty')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pids.map((pid: any, index: number) => {
            const pdoc = pdict[pid] || {};
            const psdoc = psdict[pid] || {};
            const selfPsdoc = selfPsdict[pid] || {};
            const disabled = invalid || !enrolled || pdoc.hidden || !pdoc.docId;
            return (
              <Table.Tr key={`${pid}-${index}`}>
                {enrolled && (
                  <Table.Td>
                    {psdoc.rid || psdoc.status !== undefined ? <RecordStatusBadge status={psdoc.status} size="xs" /> : null}
                  </Table.Td>
                )}
                {compare && (
                  <Table.Td>
                    {selfPsdoc.rid || selfPsdoc.status !== undefined ? <RecordStatusBadge status={selfPsdoc.status} size="xs" /> : null}
                  </Table.Td>
                )}
                <Table.Td>
                  {disabled ? (
                    <Text size="sm" c="dimmed">{pdoc.title || pid}</Text>
                  ) : viewRecords && viewedUid ? (
                    <Link
                      href={buildUrl('record_main', {}, {
                        uidOrName: String(viewedUid),
                        pid: String(pdoc.pid || pdoc.docId || pid),
                      })}
                      className="text-sm font-semibold no-underline hover:underline"
                    >
                      {pdoc.pid || pdoc.docId || String.fromCharCode(65 + index)}. {pdoc.title || pid}
                    </Link>
                  ) : (
                    <Link
                      to="problem_detail"
                      params={{ pid: pdoc.pid || pdoc.docId || pid }}
                      className="text-sm font-semibold no-underline hover:underline"
                    >
                      {pdoc.pid || pdoc.docId || String.fromCharCode(65 + index)}. {pdoc.title || pid}
                    </Link>
                  )}
                </Table.Td>
                <Table.Td className="text-right"><Text size="sm">{pdoc.nSubmit ?? '*'}</Text></Table.Td>
                <Table.Td className="text-right"><Text size="sm">{pdoc.nAccept ?? '*'}</Text></Table.Td>
                <Table.Td className="text-right"><Text size="sm">{difficulty(pdoc)}</Text></Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );
}

export default function TrainingDetailPage() {
  const { args } = usePageData();
  const user = useUserContext();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const listSearch = new URLSearchParams(window.location.search);
  const trainingListQuery = Object.fromEntries(
    ['page', 'q']
      .map((key) => [key, listSearch.get(key)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const trainingListUrl = buildUrl('training_main', {}, trainingListQuery);
  const isLoggedIn = useIsLoggedIn();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enrolledUsersOpened, setEnrolledUsersOpened] = useState(false);
  const [enrolledUsersLoading, setEnrolledUsersLoading] = useState(false);
  const [enrolledUsersPage, setEnrolledUsersPage] = useState(1);
  const [enrolledUsersPageCount, setEnrolledUsersPageCount] = useState(1);
  const [enrolledUsers, setEnrolledUsers] = useState<{ uid: number, user: any }[]>([]);
  const [enrolledUsersTotal, setEnrolledUsersTotal] = useState<number | null>(null);
  const [enrolledUsersSearch, setEnrolledUsersSearch] = useState('');

  const tdoc = args.tdoc || {};
  const tsdoc = args.tsdoc || {};
  const udoc = args.udoc || args.owner_udoc;
  const nodes = getNodes(tdoc);
  const pids = args.pids || getPids(tdoc);
  const pdict = args.pdict || args.psdict || {};
  const psdict = args.psdict || {};
  const selfPsdict = args.selfPsdict || {};
  const nsdict = args.nsdict || {};
  const missing = args.missing || [];
  const canEdit = Boolean(args.canEdit || (tdoc.owner && user?._id === tdoc.owner));
  const canDelete = Boolean(args.canDelete);
  const canViewEnrolledUsers = Boolean(args.canViewEnrolledUsers);
  const canViewOtherRecords = Boolean(args.canViewOtherRecords);
  const viewedUser = args.viewedUdoc;
  const viewedUid = Number(args.viewedUid) || undefined;
  const viewRecords = Boolean(args.viewRecords && viewedUid);
  const enrolledUserPreview = (args.enrolledUserPreview || []).slice(0, 5).map((uid: number) => ({
    uid,
    user: args.udict?.[uid] || {},
  }));
  const enrolledUserCount = Number(tdoc.attend) || 0;
  const enrolledUsersResultCount = enrolledUsersTotal ?? enrolledUserCount;
  const enrolled = isTrainingEnrolled(tsdoc);
  const selfEnrolled = isTrainingEnrolled(args.selfTsdoc || tsdoc);
  const progress = enrolled && pids.length
    ? (tsdoc.done ? 100 : Math.round(((tsdoc.donePids?.length || 0) / pids.length) * 100))
    : 0;
  const compare = Boolean(args.shouldCompare ?? (
    new URLSearchParams(window.location.search).get('uid') && enrolled
  ));

  const enroll = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'enroll' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = formatErrorMessage(data.error, t('Operation failed'));
        setError(msg);
        notifications.show({ title: msg, message: '', color: 'red' });
      } else {
        notifications.show({ title: t('Enrolled successfully'), message: '', color: 'green' });
        window.location.reload();
      }
    } catch (err: any) {
      const msg = err?.message || t('Network error');
      setError(msg);
      notifications.show({ title: msg, message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const loadEnrolledUsersPage = async (nextPage: number, keyword = enrolledUsersSearch) => {
    setEnrolledUsersLoading(true);
    try {
      const normalizedKeyword = keyword.trim();
      const res = await fetch(buildUrl('training_enrolled_users', { tid: tdoc.docId || tdoc._id }, {
        page: String(nextPage),
        ...(normalizedKeyword ? { q: normalizedKeyword } : {}),
      }), { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Load failed')));
      setEnrolledUsers((data.uids || []).map((uid: number) => ({ uid, user: data.udict?.[uid] || {} })));
      setEnrolledUsersPage(Number(data.page) || nextPage);
      setEnrolledUsersPageCount(Math.max(1, Number(data.pageCount) || 1));
      setEnrolledUsersTotal(Number(data.total) || 0);
    } catch (loadError: any) {
      notifications.show({ title: loadError?.message || t('Load failed'), message: '', color: 'red' });
    } finally {
      setEnrolledUsersLoading(false);
    }
  };

  const openEnrolledUsers = () => {
    setEnrolledUsersSearch('');
    setEnrolledUsersTotal(enrolledUserCount);
    setEnrolledUsersOpened(true);
    void loadEnrolledUsersPage(1, '');
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <Stack gap="lg">
          <Card withBorder p="xl" className="hydro-content-card">
            <Group justify="space-between" align="flex-start" gap="md">
              <div className="min-w-0">
                <Group gap="xs" mb="sm">
                  <Button component="a" href={trainingListUrl} variant="subtle" size="compact-xs" leftSection={<IconArrowLeft size={14} />}>
                    {t('Back')}
                  </Button>
                  <Badge variant="light">{t('Training')}</Badge>
                </Group>
                <Title order={1} className="text-3xl text-[var(--hydro-text)]">{tdoc.title}</Title>
                {tdoc.content && <Text size="sm" c="dimmed" mt="xs">{tdoc.content}</Text>}
              </div>
              {enrolled && (
                <Badge size="lg" color={tsdoc.done ? 'green' : 'blue'} variant="light">
                  {tsdoc.done ? t('Completed') : t('In Progress')}
                </Badge>
              )}
            </Group>
          </Card>

          {error && <Text c="red" size="sm">{error}</Text>}

          {!isLoggedIn && (
            <Card withBorder p="md" className="border-[var(--hydro-warning)]" style={{ background: 'rgba(233, 161, 0, 0.08)' }}>
              <Text size="sm">{t('Login to join training plan')}</Text>
            </Card>
          )}
          {isLoggedIn && !enrolled && (
            <Card withBorder p="md" className="border-[var(--hydro-warning)]" style={{ background: 'rgba(233, 161, 0, 0.08)' }}>
              <Text size="sm">{t('page.training_detail.invalid_when_not_enrolled')}</Text>
            </Card>
          )}
          {missing.length > 0 && (
            <Card withBorder p="md" className="border-[var(--hydro-warning)]" style={{ background: 'rgba(233, 161, 0, 0.08)' }}>
              <Text size="sm" fw={700}>{t('Some problems in the training are missing or you do not have permission to view them.')}</Text>
              <Text size="sm" c="dimmed">{missing.join(', ')}</Text>
            </Card>
          )}

          {tdoc.description && (
            <Card withBorder p="lg" className="hydro-content-card">
              <MarkdownRenderer content={tdoc.description} />
            </Card>
          )}

          {nodes.map((node: any, index: number) => {
            const state = nsdict[node._id] || {};
            const status = nodeStatus(state, enrolled);
            const invalid = state.isInvalid || (!enrolled && isLoggedIn);
            const titleLines = String(node.title || '').split('\n');
            return (
              <Card key={node._id || index} withBorder p={0} className="hydro-content-card overflow-hidden">
                <Group justify="space-between" align="flex-start" p="lg" className="border-b border-[var(--hydro-border)]">
                  <div className="min-w-0">
                    <Title order={2} size="h4">
                      {t('Section')} {node._id || index + 1}. {titleLines[0] || `${t('Section')} ${index + 1}`}
                    </Title>
                    {titleLines[1] && <Text size="sm" c="dimmed" mt={4}>{titleLines[1]}</Text>}
                  </div>
                  <Badge color={status.color} variant="light">{t(status.label)}</Badge>
                </Group>

                {state.isInvalid && node.requireNids?.length > 0 && (
                  <div className="border-b border-[var(--hydro-border)] p-4">
                    <Text size="sm" c="dimmed">
                      {t('This section cannot be challenged at present, so please complete the following sections first')}
                      : {node.requireNids.join(', ')}
                    </Text>
                  </div>
                )}
                {node.content && (
                  <div className="border-b border-[var(--hydro-border)] p-4">
                    <MarkdownRenderer content={node.content} />
                  </div>
                )}
                <TrainingProblemTable
                  node={node}
                  pdict={pdict}
                  psdict={psdict}
                  selfPsdict={selfPsdict}
                  enrolled={enrolled}
                  compare={compare}
                  invalid={invalid}
                  viewRecords={viewRecords}
                  viewedUid={viewedUid}
                />
              </Card>
            );
          })}
        </Stack>
      </div>

      <div className="w-full shrink-0 lg:w-72">
        <Stack gap="md">
          <Card withBorder p="md" className="hydro-panel">
            <Stack gap="xs">
              {isLoggedIn && !selfEnrolled && (
                <Button fullWidth size="xs" onClick={enroll} loading={loading}>{t('Enroll Training')}</Button>
              )}
              {canEdit && (
                <>
                  <Button component={Link} to="training_edit" params={{ tid: tdoc.docId || tdoc._id }} fullWidth size="xs" variant="light">
                    {t('Edit')}
                  </Button>
                  <Button component={Link} to="training_files" params={{ tid: tdoc.docId || tdoc._id }} fullWidth size="xs" variant="subtle">
                    {t('Files')}
                  </Button>
                </>
              )}
              <Button component={Link} to="wiki_help" fullWidth size="xs" variant="subtle">
                {t('Help')}
              </Button>
              {canDelete && (
                <DeleteResourceButton
                  actionUrl={buildUrl('training_detail', { tid: tdoc.docId || tdoc._id })}
                  fallbackUrl={trainingListUrl}
                  label={t('Delete Training Plan')}
                  message={t('Confirm deleting this training? Its files and status will be deleted as well.')}
                />
              )}
            </Stack>
          </Card>

          {compare && viewedUser && (
            <Card withBorder p="md" className="hydro-panel hydro-training-viewing-panel">
              <Stack gap="sm">
                <Group justify="space-between" gap="xs">
                  <Text size="xs" c="dimmed" fw={700}>{t('Viewing progress for')}</Text>
                  <Badge size="xs" color={tsdoc.done ? 'green' : 'blue'} variant="light">
                    {t(tsdoc.done ? 'Completed' : 'In Progress')}
                  </Badge>
                </Group>
                <Group gap="sm" wrap="nowrap">
                  <Avatar
                    src={getAvatarUrl(viewedUser.avatar || '', 40)}
                    alt={formatUserName(viewedUser)}
                    size={38}
                    radius="xl"
                  />
                  <Text size="sm" fw={800} truncate className="min-w-0 flex-1">{formatUserName(viewedUser)}</Text>
                </Group>
                <Button
                  component={Link}
                  href={buildUrl('training_detail', { tid: tdoc.docId || tdoc._id }, trainingListQuery)}
                  variant="light"
                  size="xs"
                  fullWidth
                >
                  {t('Back to my progress')}
                </Button>
              </Stack>
            </Card>
          )}

          {canViewEnrolledUsers && (
            <Card withBorder p="md" className="hydro-panel">
              <Group justify="space-between" mb="sm">
                <Title order={3} size="h5">{t('Enrolled Users')}</Title>
                <Badge size="xs" variant="light">{enrolledUserCount}</Badge>
              </Group>
              {enrolledUserPreview.length ? (
                <Stack gap={6}>
                  {enrolledUserPreview.map(({ uid, user: enrolledUser }) => (
                    <Link
                      key={uid}
                      href={buildUrl('training_detail', { tid: tdoc.docId || tdoc._id }, {
                        ...trainingListQuery,
                        uid: String(uid),
                        ...(canViewOtherRecords ? { viewRecords: 'true' } : {}),
                      })}
                      className="hydro-training-enrolled-user"
                    >
                      <Avatar src={getAvatarUrl(enrolledUser.avatar || '', 36)} size={34} radius="xl" />
                      <div className="min-w-0 flex-1">
                        <Text size="sm" fw={700} truncate>{formatUserName(enrolledUser) || `UID ${uid}`}</Text>
                        <Text size="xs" c="dimmed">UID {uid}</Text>
                      </div>
                      <IconChevronRight size={16} aria-hidden="true" />
                    </Link>
                  ))}
                  {enrolledUserCount > 5 && (
                    <Button
                      fullWidth
                      variant="subtle"
                      justify="space-between"
                      rightSection={<IconChevronRight size={16} />}
                      onClick={openEnrolledUsers}
                    >
                      {t('View all')}
                    </Button>
                  )}
                </Stack>
              ) : (
                <Text c="dimmed" ta="center" py="sm">{t('No enrolled users.')}</Text>
              )}
            </Card>
          )}

          <Card withBorder p="md" className="hydro-panel">
            <Title order={3} size="h5" mb="sm">{t('Information')}</Title>
            <Stack gap="sm">
              {isLoggedIn && (
                <div>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed" fw={700}>{t('Status')}</Text>
                    <Text size="xs">{enrolled ? t(tsdoc.done ? 'Completed' : 'In Progress') : t('Not Enrolled')}</Text>
                  </Group>
                  {enrolled && <Progress value={progress} mt={6} />}
                </div>
              )}
              {enrolled && (
                <Group justify="space-between">
                  <Text size="xs" c="dimmed" fw={700}>{t('Progress')}</Text>
                  <Text size="xs">{t('Completed')} {progress}%</Text>
                </Group>
              )}
              <Group justify="space-between">
                <Text size="xs" c="dimmed" fw={700}>{t('Enrollees')}</Text>
                <Text size="xs">{tdoc.attend || 0}</Text>
              </Group>
              <Group justify="space-between" align="flex-start">
                <Text size="xs" c="dimmed" fw={700}>{t('Created By')}</Text>
                {udoc ? <UserLink user={udoc} size="xs" /> : <Text size="xs">-</Text>}
              </Group>
            </Stack>
          </Card>
        </Stack>
      </div>

      <Modal
        opened={enrolledUsersOpened}
        onClose={() => setEnrolledUsersOpened(false)}
        title={(
          <Group gap="xs">
            <IconUsers size={19} />
            <Text fw={750}>{t('Enrolled Users')}</Text>
            <Badge size="sm" variant="light">{enrolledUsersResultCount}</Badge>
          </Group>
        )}
        size="lg"
      >
        <Stack gap="md">
          <Group gap="sm" wrap="nowrap">
            <TextInput
              value={enrolledUsersSearch}
              onChange={(event) => setEnrolledUsersSearch(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && void loadEnrolledUsersPage(1)}
              placeholder={t('Search users')}
              leftSection={<IconSearch size={15} />}
              className="flex-1"
            />
            <Button onClick={() => void loadEnrolledUsersPage(1)} loading={enrolledUsersLoading}>{t('Search')}</Button>
          </Group>
          {enrolledUsersLoading ? (
            <Center mih={220}><Loader size="sm" /></Center>
          ) : enrolledUsers.length ? (
            <Stack gap={6}>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {enrolledUsers.map(({ uid, user: enrolledUser }) => (
                  <Link
                    key={uid}
                    href={buildUrl('training_detail', { tid: tdoc.docId || tdoc._id }, {
                      ...trainingListQuery,
                      uid: String(uid),
                      ...(canViewOtherRecords ? { viewRecords: 'true' } : {}),
                    })}
                    className="hydro-training-enrolled-user"
                  >
                    <Avatar src={getAvatarUrl(enrolledUser.avatar || '', 36)} size={34} radius="xl" />
                    <div className="min-w-0 flex-1">
                      <Text size="sm" fw={700} truncate>{formatUserName(enrolledUser) || `UID ${uid}`}</Text>
                      <Text size="xs" c="dimmed">UID {uid}</Text>
                    </div>
                    <IconChevronRight size={16} aria-hidden="true" />
                  </Link>
                ))}
              </SimpleGrid>
              {enrolledUsersPageCount > 1 && (
                <Center mt="sm">
                  <Pagination
                    value={enrolledUsersPage}
                    total={enrolledUsersPageCount}
                    onChange={(nextPage) => void loadEnrolledUsersPage(nextPage)}
                    disabled={enrolledUsersLoading}
                  />
                </Center>
              )}
            </Stack>
          ) : (
            <Text c="dimmed" ta="center" py="xl">{t('No enrolled users.')}</Text>
          )}
        </Stack>
      </Modal>
    </div>
  );
}
