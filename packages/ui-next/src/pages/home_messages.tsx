import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';
import { Avatar, Button, Group, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

function normalizeConversations(input: any, udict: Record<string, any>) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((message) => ({
      _id: message.from,
      udoc: udict[message.from] || { _id: message.from },
      messages: [message],
    }));
  }
  return Object.values(input);
}

function messageText(message: any) {
  if (typeof message.content !== 'string') return String(message.content || '');
  try {
    const parsed = JSON.parse(message.content);
    if (parsed?.message) {
      let text = parsed.message;
      for (const [index, value] of (parsed.params || []).entries()) {
        text = text.replace(`{${index}}`, String(value));
      }
      return text;
    }
  } catch {
    // Plain text message.
  }
  return message.content;
}

export default function HomeMessagesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const udict = args.udict || {};
  const conversations = useMemo(() => normalizeConversations(args.messages, udict), [args.messages, udict]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const post = async (payload: Record<string, any>, successMessage: string) => {
    setLoading(String(payload.operation || 'operation'));
    setError('');
    setSuccess('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Operation failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else {
        setSuccess(successMessage);
        window.location.reload();
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading('');
    }
  };

  const send = async (uid: number, content: string) => {
    if (!content.trim()) return;
    await post({ operation: 'send', uid, content }, t('Sent'));
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Messages')}>
        <Button size="xs" onClick={() => setDialogOpen(true)}>{t('Send Message')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}
      {conversations.length === 0 ? (
        <EmptyState message={t('No messages')} />
      ) : (
        <Stack gap="lg">
          {conversations.map((conversation: any) => {
            const target = conversation.udoc || {};
            const targetId = Number(conversation._id || target._id);
            return (
              <Paper key={targetId} withBorder p="lg" className="hydro-content-card">
                <Stack gap="md">
                  <Group gap="sm">
                    <Avatar src={getAvatarUrl(target.avatar || '')} size="sm" radius="xl" />
                    <Stack gap={0}>
                      <Text fw={700}>{target.uname || targetId}</Text>
                      <Text c="dimmed" size="xs">UID {targetId}</Text>
                    </Stack>
                  </Group>
                  <Stack gap="sm">
                    {(conversation.messages || []).map((message: any) => {
                      const fromMe = message.from === user?._id;
                      const sender = fromMe ? user : target;
                      return (
                        <Paper key={message._id} withBorder p="sm" bg={fromMe ? 'var(--hydro-surface-muted)' : undefined}>
                          <Group justify="space-between" align="flex-start">
                            <Group gap="xs">
                              <Avatar src={getAvatarUrl(sender?.avatar || '')} size="xs" radius="xl" />
                              <Text size="sm" fw={600}>{fromMe ? t('Me') : (sender?.uname || message.from)}</Text>
                            </Group>
                            <Group gap="xs">
                              <TimeDisplay date={message.createAt || message._id} format="relative" />
                              {fromMe && (
                                <Button
                                  size="compact-xs"
                                  variant="subtle"
                                  color="red"
                                  onClick={() => post({ operation: 'delete_message', messageId: message._id }, t('Deleted'))}
                                  loading={loading === 'delete_message'}
                                >
                                  {t('Delete')}
                                </Button>
                              )}
                            </Group>
                          </Group>
                          <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>{messageText(message)}</Text>
                        </Paper>
                      );
                    })}
                  </Stack>
                  <Textarea
                    placeholder={t('Write a message...')}
                    value={drafts[targetId] || ''}
                    minRows={2}
                    autosize
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [targetId]: e.currentTarget.value }))}
                  />
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      disabled={!drafts[targetId]?.trim()}
                      loading={loading === 'send'}
                      onClick={() => send(targetId, drafts[targetId] || '')}
                    >
                      {t('Send')}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
      <FormDialog
        opened={dialogOpen}
        title={t('Send Message')}
        fields={[
          { name: 'uid', label: t('User ID'), type: 'number', required: true },
          { name: 'content', label: t('Content'), type: 'textarea', required: true },
        ]}
        onClose={() => setDialogOpen(false)}
        onSubmit={(values) => send(Number(values.uid), String(values.content || ''))}
        confirmLabel={t('Send')}
        cancelLabel={t('Cancel')}
        loading={loading === 'send'}
        error={error}
      />
    </Stack>
  );
}
