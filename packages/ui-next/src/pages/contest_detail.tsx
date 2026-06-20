import { Badge, Button, Card, Divider, Group, Paper, Select, Stack, Table, Text, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { ContestTimer } from '@/components/contest/contest-timer';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useCurrentUser, useIsLoggedIn } from '@/hooks/use-current-user';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { PERM, useHasPerm } from '@/hooks/use-permission';
import { UserLink } from '@/components/user/user-link';
import { formatErrorMessage } from '@/utils/error';

function alphabetic(index: number) {
  let value = '';
  let n = index;
  do {
    value = String.fromCharCode(65 + (n % 26)) + value;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return value;
}

function formatMemory(memory?: number) {
  if (memory == null) return '-';
  if (memory < 1024) return `${Math.round(memory)} KB`;
  return `${Math.round(memory / 1024)} MB`;
}

function getObjectIdDate(id: any) {
  const text = String(id || '');
  if (!/^[a-f0-9]{24}$/i.test(text)) return null;
  return new Date(parseInt(text.slice(0, 8), 16) * 1000);
}

function isContestClosed(tdoc: any, tsdoc?: any) {
  const now = Date.now();
  const endAt = new Date(tdoc.endAt).getTime();
  if (Number.isFinite(endAt) && endAt <= now) return true;
  const tsEndAt = tsdoc?.endAt ? new Date(tsdoc.endAt).getTime() : NaN;
  if (Number.isFinite(tsEndAt) && tsEndAt <= now) return true;
  const startAt = tsdoc?.startAt ? new Date(tsdoc.startAt).getTime() : NaN;
  if (tdoc.duration && Number.isFinite(startAt)) {
    return startAt + Number(tdoc.duration) * 60 * 60 * 1000 <= now;
  }
  return false;
}

function ContestProblemList({ tdoc, tsdoc, pdict, psdict, rdict, correction, showScore, canViewRecord }: {
  tdoc: any;
  tsdoc?: any;
  pdict: Record<string, any>;
  psdict: Record<string, any>;
  rdict: Record<string, any>;
  correction?: Record<string, any>;
  showScore?: boolean;
  canViewRecord?: boolean;
}) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const pids = tdoc.pids || [];
  const hasCorrection = correction && Object.keys(correction).length > 0;
  const closed = isContestClosed(tdoc, tsdoc);

  if (!pids.length) return null;

  return (
    <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('Problems')}</Title>
        {closed && <Badge color="gray" variant="light">{t('Contest Closed')}</Badge>}
      </Group>
      {closed && (
        <Paper withBorder p="sm" mb="sm" className="border-[var(--hydro-border)] bg-[var(--hydro-surface)]">
          <Text size="sm" c="dimmed">{t('The contest has ended. You can view the problems, but contest submissions are closed.')}</Text>
        </Paper>
      )}
      <div className="overflow-x-auto">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="w-36">{t('Status')}</Table.Th>
              {hasCorrection ? <Table.Th className="w-36">{t('Correction')}</Table.Th> : <Table.Th className="w-40">{t('Last Submit At')}</Table.Th>}
              {showScore && <Table.Th className="w-20 text-right">{t('Score')}</Table.Th>}
              <Table.Th>{t('Problem')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pids.map((pid: number, index: number) => {
              const pdoc = pdict[pid] || pdict[String(pid)] || {};
              const psdoc = psdict?.[pid] || psdict?.[String(pid)];
              const rdoc = psdoc?.rid ? rdict?.[psdoc.rid] : null;
              const correctionDoc = correction?.[pid] || correction?.[String(pid)];
              const correctionRecord = correctionDoc?.rid ? rdict?.[correctionDoc.rid] : null;
              const submitAt = getObjectIdDate(rdoc?._id || psdoc?.rid);
              const score = showScore ? (tdoc.score?.[pid] || 100) : null;
              return (
                <Table.Tr key={pid}>
                  <Table.Td>
                    {rdoc?.status != null ? (
                      canViewRecord ? (
                        <Link to="record_detail" params={{ rid: rdoc._id || psdoc.rid }} className="no-underline">
                          <RecordStatusBadge status={rdoc.status} size="xs" />
                        </Link>
                      ) : (
                        <Text size="xs">{t('Submitted')}</Text>
                      )
                    ) : (
                      <Text size="xs" c="dimmed">{t('No Submissions')}</Text>
                    )}
                  </Table.Td>
                  {hasCorrection ? (
                    <Table.Td>
                      {correctionRecord?.status != null ? <RecordStatusBadge status={correctionRecord.status} size="xs" /> : <Text size="xs" c="dimmed">-</Text>}
                    </Table.Td>
                  ) : (
                    <Table.Td>{submitAt ? <TimeDisplay date={submitAt} format="relative" size="xs" /> : <Text size="xs" c="dimmed">-</Text>}</Table.Td>
                  )}
                  {showScore && <Table.Td className="text-right"><Badge size="xs" variant="light">{score}</Badge></Table.Td>}
                  <Table.Td>
                    <Group justify="space-between" wrap="nowrap" gap="md">
                      <div className="min-w-0">
                        <Link href={buildUrl('problem_detail', { pid }, { tid: String(tdoc.docId || tdoc._id) })} className="hydro-subtle-link">
                          <Text size="sm" fw={700} className="truncate">{alphabetic(index)}. {pdoc.title || pid}</Text>
                        </Link>
                        {pdoc.config && pdoc.config.type !== 'objective' && pdoc.config.type !== 'submit_answer' && (
                          <Group gap="xs" mt={4}>
                            <Badge size="xs" variant="outline">{pdoc.config.timeMin === pdoc.config.timeMax ? pdoc.config.timeMax : `${pdoc.config.timeMin}~${pdoc.config.timeMax}`}ms</Badge>
                            <Badge size="xs" variant="outline">{pdoc.config.memoryMin === pdoc.config.memoryMax ? pdoc.config.memoryMax : `${pdoc.config.memoryMin}~${pdoc.config.memoryMax}`}MiB</Badge>
                          </Group>
                        )}
                      </div>
                      {pdoc.config?.type !== 'objective' && !closed && (
                        <Button
                          component={Link}
                          href={buildUrl('problem_detail', { pid }, { tid: String(tdoc.docId || tdoc._id) })}
                          size="compact-xs"
                          variant="light"
                        >
                          {t('Go to Solve')}
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    </Card>
  );
}

function SubmissionList({ rdocs, pdict, udict, canViewRecord }: { rdocs: any[]; pdict: Record<string, any>; udict: Record<string, any>; canViewRecord: boolean }) {
  const { t } = useI18n();
  if (!canViewRecord) {
    return (
      <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
        <Text size="sm" c="dimmed">{t('According to the contest rules, you cannot view your submission details at current.')}</Text>
      </Card>
    );
  }
  return (
    <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
      <Title order={4} mb="sm">{t('Submissions')}</Title>
      {rdocs.length ? (
        <div className="overflow-x-auto">
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('Status')}</Table.Th>
                <Table.Th>{t('Problem')}</Table.Th>
                <Table.Th>{t('Submit By')}</Table.Th>
                <Table.Th>{t('Time')}</Table.Th>
                <Table.Th>{t('Memory')}</Table.Th>
                <Table.Th>{t('Language')}</Table.Th>
                <Table.Th>{t('Submit At')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rdocs.map((rdoc) => {
                const pdoc = pdict[rdoc.pid] || {};
                const udoc = udict[rdoc.uid] || {};
                return (
                  <Table.Tr key={rdoc._id}>
                    <Table.Td><Link to="record_detail" params={{ rid: rdoc._id }} className="no-underline"><RecordStatusBadge status={rdoc.status} size="xs" /></Link></Table.Td>
                    <Table.Td><Text size="xs">{pdoc.title || rdoc.pid}</Text></Table.Td>
                    <Table.Td><UserLink user={udoc} size="xs" /></Table.Td>
                    <Table.Td><Text size="xs">{rdoc.time != null ? `${rdoc.time}ms` : '-'}</Text></Table.Td>
                    <Table.Td><Text size="xs">{formatMemory(rdoc.memory)}</Text></Table.Td>
                    <Table.Td><Text size="xs">{rdoc.lang || '-'}</Text></Table.Td>
                    <Table.Td>{getObjectIdDate(rdoc._id) ? <TimeDisplay date={getObjectIdDate(rdoc._id)!} format="relative" size="xs" /> : '-'}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </div>
      ) : (
        <Text size="sm" c="dimmed">{t('Oh, there is no submission!')}</Text>
      )}
    </Card>
  );
}

function ClarificationList({ tdoc, pdict, tcdocs, udict, tsdoc }: { tdoc: any; pdict: Record<string, any>; tcdocs: any[]; udict: Record<string, any>; tsdoc: any }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [subject, setSubject] = useState('0');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'clarification', subject: Number(subject), content }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed')));
      setContent('');
      navigate(window.location.pathname + window.location.search);
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const subjectLabel = (value: number) => {
    if (value === -1) return t('Technical Issue');
    if (!value) return t('General Issue');
    const index = (tdoc.pids || []).indexOf(value);
    return `${index >= 0 ? `${alphabetic(index)}. ` : ''}${pdict[value]?.title || value}`;
  };

  return (
    <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
      <Title order={4} mb="sm">{t('Contest Clarifications')}</Title>
      {tcdocs.length ? (
        <Stack gap="md">
          {tcdocs.map((doc) => (
            <Paper key={doc._id} withBorder p="md">
              <Group justify="space-between" mb="xs">
                <Text size="xs" c="dimmed">
                  {t('Subject')}: {subjectLabel(doc.subject || 0)} | {doc.owner === 0 ? t('Jury') : (udict[doc.owner]?.uname || doc.owner)}
                </Text>
                <TimeDisplay date={doc._id} format="relative" size="xs" />
              </Group>
              <MarkdownRenderer content={doc.content || ''} />
              {(doc.reply || []).map((reply: any) => (
                <div key={reply._id}>
                  <Divider my="sm" />
                  <Text size="xs" c="dimmed" mb="xs">{t('Jury')} @ <TimeDisplay date={reply._id} format="relative" size="xs" /></Text>
                  <MarkdownRenderer content={reply.content || ''} />
                </div>
              ))}
            </Paper>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">{t('Oh, there is no clarification!')}</Text>
      )}

      {tsdoc?.attend && (
        <Stack gap="sm" mt="lg">
          <Title order={5}>{t('Send Clarification Request')}</Title>
          <Select
            label={t('Subject')}
            value={subject}
            onChange={(value) => setSubject(value || '0')}
            data={[
              { value: '0', label: t('General Issue') },
              { value: '-1', label: t('Technical Issue') },
              ...(tdoc.pids || []).map((pid: number, index: number) => ({ value: String(pid), label: `${alphabetic(index)}. ${pdict[pid]?.title || pid}` })),
            ]}
          />
          <Textarea label={t('Content')} minRows={4} value={content} onChange={(event) => setContent(event.currentTarget.value)} />
          <Group justify="flex-end"><Button onClick={submit} loading={loading}>{t('Submit')}</Button></Group>
        </Stack>
      )}
    </Card>
  );
}

function contestState(tdoc: any) {
  const now = Date.now();
  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  if (now < beginAt) return 'Upcoming';
  if (now >= endAt) return 'Finished';
  return 'Running';
}

function ContestInfoCard({ tdoc, tsdoc, owner }: { tdoc: any, tsdoc?: any, owner?: any }) {
  const { t } = useI18n();

  return (
    <Paper withBorder p="md" className="hydro-panel">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('Status')}</Text>
          <Badge size="xs" variant="light">{t(contestState(tdoc))}{tsdoc?.attend ? ` (${t('Attended')})` : ''}</Badge>
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('Start')}</Text>
          <TimeDisplay date={tdoc.beginAt} format="absolute" size="xs" />
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('End')}</Text>
          <TimeDisplay date={tdoc.endAt} format="absolute" size="xs" />
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('Rule')}</Text>
          <Badge size="xs" variant="light">{tdoc.rule}</Badge>
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('Problem')}</Text>
          <Text size="xs">{tdoc.pids?.length || tdoc.pdoc?.length || 0}</Text>
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('Partic.')}</Text>
          <Text size="xs">{tdoc.attend || 0}</Text>
        </Group>
        {owner && (
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Text size="xs" c="dimmed" fw={700}>{t('Host')}</Text>
            <UserLink user={owner} size="xs" />
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

export default function ContestDetailPage() {
  const { args, name } = usePageData();
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();

  const tdoc = args.tdoc || {};
  const tsdoc = args.tsdoc || {};
  const owner = args.owner_udoc || args.udict?.[tdoc.owner] || args.udoc;
  const files = args.files || [];
  const pdict = args.pdict || {};
  const udict = args.udict || {};
  const canEdit = useHasPerm(PERM.PERM_EDIT_CONTEST) || args.canEdit;
  const tid = tdoc._id || tdoc.docId;

  const handleAttend = async () => {
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'attend' }),
      });
      const data = await res.json();
      if (!data.error) {
        navigate(window.location.href);
      }
    } catch (err) {
      console.error('Failed to attend:', err);
    }
  };

  if (name === 'contest_problemlist') {
    return (
      <Stack gap="lg">
        <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
          <Group justify="space-between" align="flex-start" gap="lg">
            <div className="min-w-0 flex-1">
              <Badge variant="light" color="hydroCopper" mb="sm">
                {t('Problems')}
              </Badge>
              <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)] md:text-4xl">
                {tdoc.title}
              </Title>
            </div>
            <div className="shrink-0">
              <ContestTimer beginAt={tdoc.beginAt} endAt={tdoc.endAt} />
            </div>
          </Group>
        </Card>

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1">
            <Stack gap="lg">
              <ContestProblemList
                tdoc={tdoc}
                tsdoc={tsdoc}
                pdict={pdict}
                psdict={args.psdict || {}}
                rdict={args.rdict || {}}
                correction={args.correction || {}}
                showScore={args.showScore}
                canViewRecord={args.canViewRecord !== false}
              />
              <SubmissionList
                rdocs={args.rdocs || []}
                pdict={pdict}
                udict={udict}
                canViewRecord={args.canViewRecord !== false}
              />
              <ClarificationList
                tdoc={tdoc}
                pdict={pdict}
                tcdocs={args.tcdocs || []}
                udict={udict}
                tsdoc={tsdoc}
              />
            </Stack>
          </div>

          <div className="w-full shrink-0 lg:w-64">
            <Stack gap="md">
              {tdoc.privateFiles?.length > 0 && (
                <Paper withBorder p="md" className="hydro-panel">
                  <Text size="sm" fw={800} mb="xs">{t('Materials')}</Text>
                  <Stack gap="xs">
                    {tdoc.privateFiles.map((file: any) => (
                      <Link key={file.name} href={buildUrl('contest_file_download', { tid, type: 'private', filename: file.name })} className="hydro-subtle-link">
                        <Text size="xs">{file.name}</Text>
                      </Link>
                    ))}
                  </Stack>
                </Paper>
              )}
              <ContestInfoCard tdoc={tdoc} tsdoc={tsdoc} owner={owner || udict[tdoc.owner]} />
              <Button component={Link} to="contest_detail" params={{ tid }} variant="subtle" fullWidth>{t('View Contest')}</Button>
              <Button component={Link} to="contest_scoreboard" params={{ tid }} variant="light" fullWidth>{t('Scoreboard')}</Button>
              {canEdit && <Button component={Link} to="contest_manage" params={{ tid }} variant="subtle" fullWidth>{t('Contest Management')}</Button>}
            </Stack>
          </div>
        </div>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
        <Group justify="space-between" align="flex-start" gap="lg">
          <div className="min-w-0 flex-1">
            <Badge variant="light" color="hydroCopper" mb="sm">
              {t('Contest')}
            </Badge>
            <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)] md:text-4xl">
              {tdoc.title}
            </Title>
          </div>
          <div className="shrink-0">
            <ContestTimer beginAt={tdoc.beginAt} endAt={tdoc.endAt} />
          </div>
        </Group>
      </Card>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          {tdoc.content && (
            <Card withBorder p="lg" mb="md" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]">
              <MarkdownRenderer content={tdoc.content} />
            </Card>
          )}

          {files.length > 0 && (
            <Card withBorder p="lg" mt="md" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]">
              <Title order={4} mb="sm">{t('Files')}</Title>
              <Stack gap="xs">
                {files.map((f: any) => (
                  <Group key={f.name} justify="space-between" className="rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] px-3 py-2">
                    <Link href={buildUrl('contest_file_download', { tid, type: 'private', filename: f.name })} className="hydro-subtle-link">
                      <Text size="sm" fw={600}>{f.name}</Text>
                    </Link>
                    <Text size="xs" c="dimmed">{Math.round((f.size || 0) / 1024)}KB</Text>
                  </Group>
                ))}
              </Stack>
            </Card>
          )}
        </div>

        <div className="w-full lg:w-64 shrink-0">
          <Stack gap="md">
            <ContestInfoCard tdoc={tdoc} tsdoc={tsdoc} owner={owner} />

            {isLoggedIn && !tsdoc.attend && (
              <Button fullWidth onClick={handleAttend}>
                {t('Register Contest')}
              </Button>
            )}

            {isLoggedIn && tsdoc.attend && (
              <Button component={Link} to="contest_problemlist" params={{ tid }} variant="light" fullWidth>
                {t('Problem List')}
              </Button>
            )}

            {isLoggedIn && tsdoc.attend && (
              <Button component={Link} to="contest_scoreboard" params={{ tid }} variant="light" fullWidth>
                {t('Scoreboard')}
              </Button>
            )}

            {tdoc.allowPrint && (tsdoc.attend || canEdit) && (
              <Button component={Link} to="contest_print" params={{ tid }} variant="subtle" fullWidth>
                {t('Print')}
              </Button>
            )}

            {canEdit && (
              <>
                <Button component={Link} to="contest_edit" params={{ tid }} variant="subtle" fullWidth>
                  {t('Edit Contest')}
                </Button>
                <Button component={Link} to="contest_manage" params={{ tid }} variant="subtle" fullWidth>
                  {t('Contest Management')}
                </Button>
              </>
            )}

            <Button component={Link} href={buildUrl('record_main', {}, { tid: String(tid) })} variant="subtle" fullWidth>
              {t('All Submissions')}
            </Button>

            {tsdoc.attend && (
              <Button component={Link} href={buildUrl('record_main', {}, { tid: String(tid), uidOrName: String(user._id) })} variant="subtle" fullWidth>
                {t('My Submissions')}
              </Button>
            )}
          </Stack>
        </div>
      </div>
    </Stack>
  );
}
