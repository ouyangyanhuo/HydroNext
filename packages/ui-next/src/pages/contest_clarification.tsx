import { Badge, Button, Card, Divider, Group, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
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

function subjectLabel(tdoc: any, pdict: Record<string, any>, subject: number, t: (value: string) => string) {
  if (subject === -1) return t('Technical Issue');
  if (!subject) return t('General Issue');
  const index = (tdoc.pids || []).indexOf(subject);
  return `${index >= 0 ? `${alphabetic(index)}. ` : ''}${pdict[subject]?.title || subject}`;
}

export default function ContestClarificationPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const tdoc = args.tdoc || {};
  const pdict = args.pdict || {};
  const udict = args.udict || {};
  const tcdocs = args.tcdocs || args.clarifications || [];
  const tid = tdoc.docId || tdoc._id;
  const [mode, setMode] = useState<'broadcast' | 'reply'>('broadcast');
  const [did, setDid] = useState('');
  const [subject, setSubject] = useState('0');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState('');

  const replyTarget = tcdocs.find((doc: any) => String(doc._id) === did);

  const chooseBroadcast = () => {
    setMode('broadcast');
    setDid('');
    setContent('');
  };

  const chooseReply = (doc: any) => {
    setMode('reply');
    setDid(String(doc._id));
    setContent('');
  };

  const submit = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          operation: 'clarification',
          did: mode === 'reply' ? did : undefined,
          subject: mode === 'broadcast' ? Number(subject) : undefined,
          content,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed')));
      notifications.show({ title: t('Submitted'), message: '', color: 'green' });
      chooseBroadcast();
      navigate(window.location.pathname + window.location.search);
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const deleteClarification = async (doc: any) => {
    if (!window.confirm(t('Confirm to delete this clarification?'))) return;
    setDeleteLoading(String(doc._id));
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete_clarification', did: doc._id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed')));
      notifications.show({ title: t('Deleted'), message: '', color: 'green' });
      if (did === String(doc._id)) chooseBroadcast();
      navigate(window.location.pathname + window.location.search);
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setDeleteLoading('');
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Contest Clarifications')} - ${tdoc.title}`}>
        <Group gap="xs">
          <Button size="xs" onClick={chooseBroadcast}>{t('Send Broadcast Message')}</Button>
          <Button component={Link} to="contest_manage" params={{ tid }} size="xs" variant="subtle">{t('Contest Management')}</Button>
        </Group>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Stack gap="lg">
            <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
              <Title order={2} size="h4" mb="md">{t('Contest Clarifications')}</Title>
              {tcdocs.length ? (
                <Stack gap="md">
                  {tcdocs.map((doc: any) => (
                    <Paper key={doc._id} id={`clarification_${doc._id}`} withBorder p="md">
                      <Group justify="space-between" align="flex-start" mb="xs">
                        <div className="min-w-0">
                          <Text size="xs" c="dimmed">
                            {t('Subject')}: {subjectLabel(tdoc, pdict, doc.subject || 0, t)}
                            {' | '}
                            {doc.owner === 0 ? <b>{t('Jury')}</b> : (udict[doc.owner]?.uname || doc.owner)}
                          </Text>
                          <TimeDisplay date={doc._id} format="relative" size="xs" />
                        </div>
                        <Group gap="xs">
                          {doc.owner ? (
                            <Button size="compact-xs" variant="light" onClick={() => chooseReply(doc)}>
                              {t('Reply')}
                            </Button>
                          ) : (
                            <Badge size="xs" variant="light">{t('Broadcast')}</Badge>
                          )}
                          <Button
                            size="compact-xs"
                            color="red"
                            variant="subtle"
                            loading={deleteLoading === String(doc._id)}
                            onClick={() => deleteClarification(doc)}
                          >
                            {t('Delete')}
                          </Button>
                        </Group>
                      </Group>
                      <MarkdownRenderer content={doc.content || ''} />
                      {(doc.reply || []).map((reply: any) => (
                        <div key={reply._id}>
                          <Divider my="sm" />
                          <Text size="xs" c="dimmed" mb="xs"><b>{t('Jury')}</b></Text>
                          <MarkdownRenderer content={reply.content || ''} />
                        </div>
                      ))}
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">{t('Oh, there is no clarification!')}</Text>
              )}
            </Card>

            <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
              <Title order={2} size="h4" mb="md">
                {mode === 'reply' ? `${t('Reply')} #${did}` : t('Send Broadcast Message')}
              </Title>
              {replyTarget && (
                <Paper withBorder p="sm" mb="md" className="bg-[var(--hydro-surface)]">
                  <Text size="xs" c="dimmed" mb="xs">
                    {t('Subject')}: {subjectLabel(tdoc, pdict, replyTarget.subject || 0, t)}
                  </Text>
                  <MarkdownRenderer content={replyTarget.content || ''} />
                </Paper>
              )}
              <Stack gap="sm">
                {mode === 'broadcast' && (
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
                )}
                <Textarea label={t('Content')} value={content} minRows={5} onChange={(event) => setContent(event.currentTarget.value)} />
                <Group justify="flex-end">
                  {mode === 'reply' && <Button variant="subtle" onClick={chooseBroadcast}>{t('Cancel')}</Button>}
                  <Button onClick={submit} loading={loading}>{t('Submit')}</Button>
                </Group>
              </Stack>
            </Card>
          </Stack>
        </div>

        <div className="w-full shrink-0 lg:w-72">
          <Card withBorder p="md" className="hydro-panel">
            <Stack gap="xs">
              <Text size="sm" fw={800}>{t('Contest Management')}</Text>
              <Button component={Link} to="contest_manage" params={{ tid }} variant="subtle" justify="flex-start" size="xs" fullWidth>{t('Overview')}</Button>
              <Button component={Link} to="contest_user" params={{ tid }} variant="subtle" justify="flex-start" size="xs" fullWidth>{t('Participants')}</Button>
              <Button component={Link} to="contest_balloon" params={{ tid }} variant="subtle" justify="flex-start" size="xs" fullWidth>{t('Balloons')}</Button>
              <Button component={Link} to="contest_scoreboard" params={{ tid }} variant="subtle" justify="flex-start" size="xs" fullWidth>{t('Scoreboard')}</Button>
            </Stack>
          </Card>
        </div>
      </div>
    </Stack>
  );
}
