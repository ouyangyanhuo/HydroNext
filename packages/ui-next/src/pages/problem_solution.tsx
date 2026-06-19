import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function docDate(id: any) {
  const text = String(id || '');
  if (/^[0-9a-f]{24}$/i.test(text)) return parseInt(text.slice(0, 8), 16) * 1000;
  return id;
}

function docId(doc: any) {
  return String(doc._id || doc.docId || '');
}

async function postOperation(payload: Record<string, any>, fallback: string) {
  const res = await fetch(window.location.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.error) throw new Error(formatErrorMessage(data.error, fallback));
  return data;
}

function Composer({
  initial = '',
  placeholder,
  submitText,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  submitText: string;
  loading?: boolean;
  error?: string;
  onSubmit: (content: string) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [content, setContent] = useState(initial);

  return (
    <Card withBorder p="md" className="hydro-content-card">
      <Stack gap="sm">
        {error && <Text c="red" size="sm">{error}</Text>}
        <MarkdownEditor
          value={content}
          onChange={setContent}
          minRows={5}
          placeholder={placeholder}
        />
        <Group justify="flex-end" gap="xs">
          {onCancel && <Button variant="subtle" size="xs" onClick={onCancel}>{t('Cancel')}</Button>}
          <Button
            size="xs"
            loading={loading}
            onClick={() => content.trim() && onSubmit(content)}
          >
            {submitText}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function SolutionCard({
  solution,
  user,
  pssdict,
  udict,
  pid,
  isLoggedIn,
  onRefresh,
}: {
  solution: any;
  user: any;
  pssdict: Record<string, any>;
  udict: Record<string, any>;
  pid: string | number;
  isLoggedIn: boolean;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingReply, setEditingReply] = useState('');
  const sid = docId(solution);
  const vote = pssdict[sid]?.vote || pssdict[solution._id]?.vote || 0;

  const run = async (operation: string, payload: Record<string, any> = {}, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(operation);
    setError('');
    try {
      await postOperation({ operation, psid: sid, ...payload }, t('Operation failed'));
      onRefresh();
    } catch (err: any) {
      setError(err?.message || t('Operation failed'));
    } finally {
      setBusy('');
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/p/${pid}/solution/${sid}`;
    await navigator.clipboard?.writeText(url);
  };

  return (
    <Card withBorder p="lg" className="hydro-content-card">
      <div className="grid gap-4 sm:grid-cols-[64px_1fr]">
        <Stack gap={6} align="center" className="rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] p-2">
          <Button
            size="compact-xs"
            variant={vote === 1 ? 'filled' : 'subtle'}
            disabled={!isLoggedIn}
            loading={busy === 'upvote'}
            onClick={() => run('upvote')}
          >
            +
          </Button>
          <Text fw={800}>{solution.vote || 0}</Text>
          <Button
            size="compact-xs"
            variant={vote === -1 ? 'filled' : 'subtle'}
            color="red"
            disabled={!isLoggedIn}
            loading={busy === 'downvote'}
            onClick={() => run('downvote')}
          >
            -
          </Button>
        </Stack>

        <Stack gap="md" className="min-w-0">
          <Group justify="space-between" align="flex-start" gap="md">
            <Group gap="xs">
              <UserLink user={user || { _id: solution.owner, uname: String(solution.owner) }} />
              <Text size="xs" c="dimmed">@</Text>
              <TimeDisplay date={docDate(solution._id || solution.docId)} format="relative" />
            </Group>
            <Group gap={4}>
              <Button size="compact-xs" variant="subtle" onClick={copyLink}>{t('Copy Link')}</Button>
              {isLoggedIn && <Button size="compact-xs" variant="subtle" onClick={() => setReplying((v) => !v)}>{t('Reply')}</Button>}
              {isLoggedIn && <Button size="compact-xs" variant="subtle" onClick={() => setEditing((v) => !v)}>{t('Edit')}</Button>}
              {isLoggedIn && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  loading={busy === 'delete_solution'}
                  onClick={() => run('delete_solution', {}, t('Confirm delete?'))}
                >
                  {t('Delete')}
                </Button>
              )}
            </Group>
          </Group>

          {error && <Text c="red" size="sm">{error}</Text>}

          {editing ? (
            <Composer
              initial={solution.content || ''}
              placeholder={t('Write Your Solution')}
              submitText={t('Update')}
              loading={busy === 'edit_solution'}
              onCancel={() => setEditing(false)}
              onSubmit={(content) => run('edit_solution', { content })}
            />
          ) : (
            <MarkdownRenderer content={solution.content || ''} />
          )}

          {!!solution.reply?.length && (
            <Stack gap="sm" className="border-l-2 border-[var(--hydro-border)] pl-4">
              {solution.reply.map((reply: any) => {
                const rid = docId(reply);
                const replyUser = udict[reply.owner] || { _id: reply.owner, uname: String(reply.owner) };
                return (
                  <div key={rid} className="rounded-md bg-[var(--hydro-surface)] p-3">
                    <Group justify="space-between" align="flex-start" gap="md" mb="xs">
                      <Group gap="xs">
                        <UserLink user={replyUser} size="xs" />
                        <Text size="xs" c="dimmed">@</Text>
                        <TimeDisplay date={docDate(reply._id || reply.docId)} format="relative" />
                      </Group>
                      {isLoggedIn && (
                        <Group gap={4}>
                          <Button size="compact-xs" variant="subtle" onClick={() => setReplying(true)}>{t('Reply')}</Button>
                          <Button size="compact-xs" variant="subtle" onClick={() => setEditingReply(editingReply === rid ? '' : rid)}>{t('Edit')}</Button>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="red"
                            loading={busy === `delete_reply:${rid}`}
                            onClick={() => run('delete_reply', { psrid: rid }, t('Confirm delete?'))}
                          >
                            {t('Delete')}
                          </Button>
                        </Group>
                      )}
                    </Group>
                    {editingReply === rid ? (
                      <Composer
                        initial={reply.content || ''}
                        placeholder={t('Reply')}
                        submitText={t('Update')}
                        loading={busy === 'edit_reply'}
                        onCancel={() => setEditingReply('')}
                        onSubmit={(content) => run('edit_reply', { psrid: rid, content })}
                      />
                    ) : (
                      <MarkdownRenderer content={reply.content || ''} />
                    )}
                  </div>
                );
              })}
            </Stack>
          )}

          {replying && (
            <Composer
              placeholder={t('Reply')}
              submitText={t('Reply')}
              loading={busy === 'reply'}
              onCancel={() => setReplying(false)}
              onSubmit={(content) => run('reply', { content })}
            />
          )}
        </Stack>
      </div>
    </Card>
  );
}

export default function ProblemSolutionPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const psdocs = args.psdocs || [];
  const udict = args.udict || {};
  const pssdict = args.pssdict || {};
  const page = args.page || 1;
  const pcount = args.pcount || 1;
  const pscount = args.pscount ?? psdocs.length;
  const sid = args.sid;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = () => navigate(window.location.href);

  const handleSubmit = async (content: string) => {
    setLoading(true);
    setError('');
    try {
      await postOperation({ operation: 'submit', content }, t('Submit failed'));
      refresh();
    } catch (err: any) {
      setError(err?.message || t('Submit failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Solutions')} - ${pdoc.pid}. ${pdoc.title}`}>
        <Badge variant="light">{pscount} {t('solutions')}</Badge>
      </PageHeader>

      {isLoggedIn && !sid && (
        <Composer
          placeholder={t('Write Your Solution')}
          submitText={t('Share')}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
        />
      )}

      {psdocs.length === 0 ? (
        <EmptyState message={t('No solutions so far...')} />
      ) : (
        <Stack gap="md">
          {psdocs.map((solution: any) => (
            <SolutionCard
              key={docId(solution)}
              solution={solution}
              user={udict[solution.owner]}
              pssdict={pssdict}
              udict={udict}
              pid={pdoc.pid || pdoc.docId}
              isLoggedIn={isLoggedIn}
              onRefresh={refresh}
            />
          ))}
        </Stack>
      )}

      {!sid && <Paginator page={page} totalPages={pcount} />}
      {sid && (
        <Card withBorder p="md" className="hydro-content-card">
          <Button variant="light" fullWidth onClick={() => navigate(`/p/${pdoc.pid || pdoc.docId}/solution`)}>
            {t('View all {0} solutions').replace('{0}', String(pscount))}
          </Button>
        </Card>
      )}
    </Stack>
  );
}
