import { Avatar, Badge, Button, Card, Group, Progress, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useState } from 'react';
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
}: {
  node: any;
  pdict: Record<string, any>;
  psdict: Record<string, any>;
  selfPsdict: Record<string, any>;
  enrolled: boolean;
  compare: boolean;
  invalid: boolean;
}) {
  const { t } = useI18n();
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
                  ) : (
                    <Link to="problem_detail" params={{ pid: pdoc.pid || pdoc.docId || pid }} className="text-sm font-semibold no-underline hover:underline">
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
  const isLoggedIn = useIsLoggedIn();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
  const udict = args.udict || {};
  const enrolledUsers = Object.entries<any>(udict);
  const canEdit = Boolean(args.canEdit || (tdoc.owner && user?._id === tdoc.owner));
  const progress = tsdoc.enroll && pids.length
    ? (tsdoc.done ? 100 : Math.round(((tsdoc.donePids?.length || 0) / pids.length) * 100))
    : 0;
  const compare = Boolean(new URLSearchParams(window.location.search).get('uid') && tsdoc.enroll);

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

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <Stack gap="lg">
          <Card withBorder p="xl" className="hydro-content-card">
            <Group justify="space-between" align="flex-start" gap="md">
              <div className="min-w-0">
                <Group gap="xs" mb="sm">
                  <Button component="a" href={buildUrl('training_main')} variant="subtle" size="compact-xs" leftSection={<IconArrowLeft size={14} />}>
                    {t('Back')}
                  </Button>
                  <Badge variant="light">{t('Training')}</Badge>
                </Group>
                <Title order={1} className="text-3xl text-[var(--hydro-text)]">{tdoc.title}</Title>
                {tdoc.content && <Text size="sm" c="dimmed" mt="xs">{tdoc.content}</Text>}
              </div>
              {tsdoc.enroll && (
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
          {isLoggedIn && !tsdoc.enroll && (
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
            const status = nodeStatus(state, !!tsdoc.enroll);
            const invalid = state.isInvalid || (!tsdoc.enroll && isLoggedIn);
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
                      {t('This section cannot be challenged at present, so please complete the following sections first')}: {node.requireNids.join(', ')}
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
                  enrolled={!!tsdoc.enroll}
                  compare={compare}
                  invalid={invalid}
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
              {isLoggedIn && !tsdoc.enroll && (
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
            </Stack>
          </Card>

          {enrolledUsers.length > 0 && (
            <Card withBorder p="md" className="hydro-panel">
              <Title order={3} size="h5" mb="sm">{t('Enrolled Users')}</Title>
              <Stack gap={4}>
                {enrolledUsers.slice(0, 20).map(([uid, enrolledUser]) => (
                  <Link
                    key={uid}
                    href={`/training/${tdoc.docId || tdoc._id}?uid=${uid}`}
                    className="rounded px-2 py-1 no-underline hover:bg-[var(--hydro-surface-hover)]"
                  >
                    <Group gap="xs" wrap="nowrap">
                      <Avatar src={getAvatarUrl(enrolledUser.avatar || '', 24)} size={20} radius="xl" />
                      <Text size="xs" truncate>{enrolledUser.displayName && enrolledUser.displayName !== enrolledUser.uname ? `${enrolledUser.displayName} (${enrolledUser.uname})` : enrolledUser.uname}</Text>
                    </Group>
                  </Link>
                ))}
              </Stack>
            </Card>
          )}

          <Card withBorder p="md" className="hydro-panel">
            <Title order={3} size="h5" mb="sm">{t('Information')}</Title>
            <Stack gap="sm">
              {isLoggedIn && (
                <div>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed" fw={700}>{t('Status')}</Text>
                    <Text size="xs">{tsdoc.enroll ? t(tsdoc.done ? 'Completed' : 'In Progress') : t('Not Enrolled')}</Text>
                  </Group>
                  {tsdoc.enroll && <Progress value={progress} mt={6} />}
                </div>
              )}
              {tsdoc.enroll && (
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
    </div>
  );
}
