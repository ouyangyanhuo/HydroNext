import { Badge, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft, IconArrowUp, IconChevronDown, IconChevronUp, IconLink, IconMessage, IconPencil, IconTrash,
} from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { Link } from '@/components/link';
import { copyCodeText } from '@/components/markdown/code-copy';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';
import { solutionPermissions } from '@/utils/solution-permissions';
import { formatUserName } from '@/utils/user-name';

const MAX_HEIGHT = 260;

function docDate(id: any) {
  const text = String(id || '');
  if (/^[0-9a-f]{24}$/i.test(text)) return Number.parseInt(text.slice(0, 8), 16) * 1000;
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
  if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, fallback));
  return data;
}

function UserBadges({ user }: { user: any }) {
  if (!user) return null;
  const level = user.level || 0;
  const priv = user.priv || 0;
  const isSU = !!(priv & (1 << 0));
  const isMOD = !!(priv & (1 << 25));
  return (
    <>
      {user.badge && (() => {
        const parts = user.badge.split('#');
        return (
          <Badge
            size="xs"
            variant="filled"
            style={{ backgroundColor: `#${parts[1] || '666'}`, color: parts[2] ? `#${parts[2]}` : '#fff' }}
          >
            {parts[0]}
          </Badge>
        );
      })()}
      {level > 0 && (
        <Badge size="xs" variant="light" color="hydroCopper">
          LV {level}
        </Badge>
      )}
      {isSU && (
        <Badge size="xs" variant="filled" color="red">SU</Badge>
      )}
      {isMOD && (
        <Badge size="xs" variant="filled" color="orange">MOD</Badge>
      )}
    </>
  );
}

function CollapsibleContent({ content, maxHeight = MAX_HEIGHT }: { content: any, maxHeight?: number }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;
    const update = () => setOverflowing(element.scrollHeight > maxHeight + 20);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [content, maxHeight]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className="overflow-hidden"
        style={{ maxHeight: expanded ? 'none' : maxHeight }}
      >
        <MarkdownRenderer content={content || ''} />
      </div>
      {overflowing && !expanded && (
        <div className="hydro-solution-fade relative -mt-8 flex justify-center pb-2 pt-12">
          <Button
            variant="subtle"
            size="compact-xs"
            leftSection={<IconChevronDown size={14} />}
            onClick={() => setExpanded(true)}
          >
            {t('Show more')}
          </Button>
        </div>
      )}
      {overflowing && expanded && (
        <Group justify="center" mt="xs">
          <Button variant="subtle" size="compact-xs" leftSection={<IconChevronUp size={14} />} onClick={() => setExpanded(false)}>
            {t('Show less')}
          </Button>
        </Group>
      )}
    </div>
  );
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
    <Card withBorder p="md" className="hydro-content-card hydro-solution-composer">
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
  onRefresh,
}: {
  solution: any;
  user: any;
  pssdict: Record<string, any>;
  udict: Record<string, any>;
  pid: string | number;
  onRefresh: (deleted?: boolean) => void;
}) {
  const { t } = useI18n();
  const currentUser = useCurrentUser();
  const permissions = solutionPermissions(currentUser, solution);
  const buildUrl = useBuildUrl();
  const [busy, setBusy] = useState('');
  const pending = useRef(false);
  const [deleting, setDeleting] = useState<{ operation: string, psrid?: string } | null>(null);
  const [error, setError] = useState('');
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingReply, setEditingReply] = useState('');
  const sid = docId(solution);
  const vote = pssdict[sid]?.vote || pssdict[solution._id]?.vote || 0;

  const run = async (operation: string, payload: Record<string, any> = {}) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(payload.psrid ? `${operation}:${payload.psrid}` : operation);
    setError('');
    try {
      await postOperation({ operation, psid: sid, ...payload }, t('Operation failed'));
      if (operation === 'edit_solution') setEditing(false);
      if (operation === 'edit_reply') setEditingReply('');
      if (operation === 'reply') setReplying(false);
      onRefresh(operation === 'delete_solution');
      return true;
    } catch (err: any) {
      setError(err?.message || t('Operation failed'));
      notifications.show({ color: 'red', message: err?.message || t('Operation failed') });
      return false;
    } finally {
      pending.current = false;
      setBusy('');
    }
  };

  const copyLink = async () => {
    try {
      const url = new URL(buildUrl('problem_solution_detail', { pid, sid }), window.location.origin).href;
      await copyCodeText(url, document);
      notifications.show({ message: t('Copied'), color: 'green' });
    } catch {
      notifications.show({ message: t('Copy failed'), color: 'red' });
    }
  };

  const udoc = user || { _id: solution.owner, uname: String(solution.owner) };

  return (
    <Card withBorder p="lg" className="hydro-content-card hydro-solution-card">
      <div className="flex gap-3">
        <div className="hydro-solution-vote flex shrink-0 flex-col items-center gap-1 pt-1">
          <Tooltip label={t('Like')} position="left" withArrow>
            <ActionIcon
              variant={vote === 1 ? 'filled' : 'subtle'}
              size="sm"
              aria-label={t('Like')}
              disabled={!permissions.vote || !!busy}
              loading={busy === 'upvote'}
              onClick={() => run('upvote')}
            >
              <IconArrowUp size={14} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" fw={800}>{solution.vote || 0}</Text>
        </div>

        <Stack gap="sm" className="min-w-0 flex-1">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <UserAvatar user={udoc} size={28} />
              <Stack gap={0}>
                <Group gap={6} wrap="nowrap" align="center">
                  <Link to="user_detail" params={{ uid: udoc._id }} className="no-underline">
                    <Text size="sm" fw={600} className="hover:underline">{formatUserName(udoc)}</Text>
                  </Link>
                  <UserBadges user={udoc} />
                </Group>
                <Text size="xs" c="dimmed">
                  <TimeDisplay date={docDate(solution._id || solution.docId)} format="relative" />
                </Text>
              </Stack>
            </Group>
            <Group gap={2} wrap="nowrap">
              <Tooltip label={t('Copy Link')}>
                <ActionIcon variant="subtle" size="sm" aria-label={t('Copy Link')} onClick={copyLink}>
                  <IconLink size={14} />
                </ActionIcon>
              </Tooltip>
              {permissions.reply && (
                <Tooltip label={t('Reply')}>
                  <ActionIcon variant="subtle" size="sm" aria-label={t('Reply')} disabled={!!busy} onClick={() => setReplying((v) => !v)}>
                    <IconMessage size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
              {permissions.edit && (
                <Tooltip label={t('Edit')}>
                  <ActionIcon variant="subtle" size="sm" aria-label={t('Edit')} disabled={!!busy} onClick={() => setEditing((v) => !v)}>
                    <IconPencil size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
              {permissions.delete && (
                <Tooltip label={t('Delete')}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="red"
                    aria-label={t('Delete')}
                    disabled={!!busy}
                    loading={busy === 'delete_solution'}
                    onClick={() => setDeleting({ operation: 'delete_solution' })}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>

          {error && <Text c="red" size="sm">{error}</Text>}

          {editing && permissions.edit ? (
            <Composer
              initial={solution.content || ''}
              placeholder={t('Write Your Solution')}
              submitText={t('Update')}
              loading={busy === 'edit_solution'}
              onCancel={() => setEditing(false)}
              onSubmit={(content) => run('edit_solution', { content })}
            />
          ) : (
            <CollapsibleContent content={solution.content} />
          )}

          {!!solution.reply?.length && (
            <Stack gap="xs" className="hydro-solution-replies ml-6 pl-3">
              {solution.reply.map((reply: any) => {
                const rid = docId(reply);
                const replyPermissions = solutionPermissions(currentUser, reply);
                const replyUser = udict[reply.owner] || { _id: reply.owner, uname: String(reply.owner) };
                return (
                  <div key={rid} className="hydro-solution-reply p-3">
                    <Group justify="space-between" align="flex-start" gap="sm" mb="xs">
                      <Group gap="xs" wrap="nowrap">
                        <UserAvatar user={replyUser} size={20} />
                        <Link to="user_detail" params={{ uid: replyUser._id }} className="no-underline">
                          <Text size="xs" fw={600} className="hover:underline">{formatUserName(replyUser)}</Text>
                        </Link>
                        <UserBadges user={replyUser} />
                        <Text size="xs" c="dimmed">
                          <TimeDisplay date={docDate(reply._id || reply.docId)} format="relative" />
                        </Text>
                      </Group>
                      <Group gap={2}>
                        {permissions.reply && (
                          <ActionIcon
                            aria-label={t('Reply')}
                            disabled={!!busy}
                            variant="subtle"
                            size="xs"
                            onClick={() => setReplying(true)}
                          >
                            <IconMessage size={12} />
                          </ActionIcon>
                        )}
                        {replyPermissions.editReply && (
                          <ActionIcon
                            aria-label={t('Edit')}
                            disabled={!!busy}
                            variant="subtle"
                            size="xs"
                            onClick={() => setEditingReply(editingReply === rid ? '' : rid)}
                          >
                            <IconPencil size={12} />
                          </ActionIcon>
                        )}
                        {replyPermissions.deleteReply && (
                          <ActionIcon
                            aria-label={t('Delete')}
                            disabled={!!busy}
                            variant="subtle"
                            size="xs"
                            color="red"
                            loading={busy === `delete_reply:${rid}`}
                            onClick={() => setDeleting({ operation: 'delete_reply', psrid: rid })}
                          >
                            <IconTrash size={12} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Group>
                    {editingReply === rid && replyPermissions.editReply ? (
                      <Composer
                        initial={reply.content || ''}
                        placeholder={t('Reply')}
                        submitText={t('Update')}
                        loading={busy === `edit_reply:${rid}`}
                        onCancel={() => setEditingReply('')}
                        onSubmit={(content) => run('edit_reply', { psrid: rid, content })}
                      />
                    ) : (
                      <CollapsibleContent content={reply.content} maxHeight={160} />
                    )}
                  </div>
                );
              })}
            </Stack>
          )}

          {replying && permissions.reply && (
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
      <ConfirmDialog
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('Delete')}
        message={t('Confirm delete?')}
        loading={!!busy}
        onConfirm={async () => {
          if (!deleting) return;
          if (await run(deleting.operation, deleting.psrid ? { psrid: deleting.psrid } : {})) setDeleting(null);
        }}
      />
    </Card>
  );
}

export default function ProblemSolutionPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const currentUser = useCurrentUser();
  const permissions = solutionPermissions(currentUser);
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
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
  const refresh = (deleted = false) => navigate(deleted && sid
    ? buildUrl('problem_solution', { pid: pdoc.pid || pdoc.docId })
    : window.location.href);

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
    <Stack gap="lg" className="hydro-solution-page">
      <div className="hydro-solution-header">
        <PageHeader title={`${pdoc.pid}. ${pdoc.title}`}>
          <Group gap="xs">
            <Button
              component="a"
              href={buildUrl('problem_detail', { pid: pdoc.pid || pdoc.docId })}
              variant="subtle"
              size="xs"
              leftSection={<IconArrowLeft size={14} />}
            >
              {t('Back')}
            </Button>
            <Badge variant="light" className="hydro-solution-count">{pscount} {t('solutions')}</Badge>
          </Group>
        </PageHeader>
        <Text size="sm" c="dimmed">{t('Solutions')}</Text>
      </div>

      {permissions.create && !sid && (
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
              onRefresh={refresh}
            />
          ))}
        </Stack>
      )}

      {!sid && <Paginator page={page} totalPages={pcount} />}
      {sid && (
        <Card withBorder p="md" className="hydro-content-card">
          <Button variant="light" fullWidth onClick={() => navigate(buildUrl('problem_solution', { pid: pdoc.pid || pdoc.docId }))}>
            {t('View all {0} solutions').replace('{0}', String(pscount))}
          </Button>
        </Card>
      )}
    </Stack>
  );
}
