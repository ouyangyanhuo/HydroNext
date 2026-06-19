import { Badge, Button, Card, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { TimeDisplay } from '@/components/common/time-display';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { ReactionBar } from '@/components/discussion/reaction-bar';
import { UserAvatar } from '@/components/user/user-avatar';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function ReplyItem({ reply, udict }: { reply: any, udict: Record<string, any> }) {
  const udoc = udict[reply.owner] || { _id: reply.owner, uname: String(reply.owner) };
  return (
    <Group align="flex-start" gap="sm" p="md" className="border-b border-[var(--hydro-border)] last:border-b-0">
      <UserAvatar user={udoc} size="sm" />
      <div className="min-w-0 flex-1">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <UserLink user={udoc} size="sm" />
          <TimeDisplay date={reply.createdAt || reply._id} format="relative" />
        </Group>
        <div className="mt-2">
          <MarkdownRenderer content={reply.content || ''} />
        </div>
      </div>
    </Group>
  );
}

export default function DiscussionDetailPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();
  const navigate = useNavigate();
  const ddoc = args.ddoc || {};
  const udoc = args.udoc || {};
  const replies = args.replies || [];
  const udict = args.udict || {};
  const [replyContent, setReplyContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'reply', content: replyContent }),
      });
      const data = await res.json();
      if (data.error) {
        setError(formatErrorMessage(data.error, t('Failed')));
      } else {
        setReplyContent('');
        navigate(window.location.href);
      }
    } catch {
      setError(t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
        <Badge variant="light" color="hydroTeal" mb="sm">
          {t('Discussion')}
        </Badge>
        <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)] md:text-4xl">{ddoc.title}</Title>
        <Group gap="md" mt="md" wrap="wrap">
          <UserLink user={udoc} />
          <TimeDisplay date={ddoc.createdAt || ddoc._id} format="both" />
        </Group>
      </Card>

      <Card withBorder p="lg" className="hydro-content-card">
        <MarkdownRenderer content={ddoc.content || ''} />
        {ddoc.reactions && ddoc.reactions.length > 0 && (
          <div className="mt-4 border-t border-[var(--hydro-border)] pt-4">
            <ReactionBar reactions={ddoc.reactions} />
          </div>
        )}
      </Card>

      <Group justify="space-between" align="center">
        <Title order={3}>{t('Replies')}</Title>
        <Badge variant="light">{replies.length}</Badge>
      </Group>

      <Card withBorder p={0} className="hydro-content-card overflow-hidden">
        {replies.length === 0 ? (
          <EmptyState message={t('No replies')} />
        ) : (
          replies.map((r: any) => <ReplyItem key={r._id || r.docId} reply={r} udict={udict} />)
        )}
      </Card>

      {isLoggedIn && (
        <Card withBorder p="lg" className="hydro-content-card">
          <Title order={4} mb="sm">{t('Post Reply')}</Title>
          {error && <Text c="red" size="sm" mb="md">{error}</Text>}
          <Textarea value={replyContent} onChange={(e) => setReplyContent(e.currentTarget.value)} minRows={4} autosize mb="md" />
          <Group justify="flex-end">
            <Button onClick={handleReply} loading={loading}>{t('Reply')}</Button>
          </Group>
        </Card>
      )}
    </Stack>
  );
}
