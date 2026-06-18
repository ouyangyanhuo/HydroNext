import { Button, Divider, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { TimeDisplay } from '@/components/common/time-display';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { UserAvatar } from '@/components/user/user-avatar';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';

function ReplyItem({ reply, udict }: { reply: any, udict: Record<string, any> }) {
  const udoc = udict[reply.owner] || { _id: reply.owner, uname: String(reply.owner) };
  return (
    <Group align="flex-start" gap="sm" p="md" className="border-b border-[var(--hydro-border)] last:border-b-0">
      <UserAvatar user={udoc} size="sm" />
      <div className="flex-1">
        <Group justify="space-between">
          <UserLink user={udoc} size="sm" />
          <TimeDisplay date={reply.createdAt || reply._id} format="relative" />
        </Group>
        <MarkdownRenderer content={reply.content || ''} />
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

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ content: replyContent }),
      });
      const data = await res.json();
      if (!data.error) { setReplyContent(''); navigate(window.location.href); }
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <Paper withBorder p="lg">
        <Title order={2}>{ddoc.title}</Title>
        <Group gap="md" mt="sm">
          <UserLink user={udoc} />
          <TimeDisplay date={ddoc.createdAt || ddoc._id} format="both" />
        </Group>
        <Divider my="md" />
        <MarkdownRenderer content={ddoc.content || ''} />
      </Paper>

      <Title order={3}>{t('Replies')} ({replies.length})</Title>

      <Paper withBorder>
        {replies.length === 0 ? (
          <Text c="dimmed" ta="center" p="xl">{t('No replies')}</Text>
        ) : (
          replies.map((r: any) => <ReplyItem key={r._id || r.docId} reply={r} udict={udict} />)
        )}
      </Paper>

      {isLoggedIn && (
        <Paper withBorder p="lg">
          <Title order={4} mb="sm">{t('Post Reply')}</Title>
          <Textarea value={replyContent} onChange={(e) => setReplyContent(e.currentTarget.value)} minRows={4} autosize mb="md" />
          <Group justify="flex-end">
            <Button onClick={handleReply} loading={loading}>{t('Reply')}</Button>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
