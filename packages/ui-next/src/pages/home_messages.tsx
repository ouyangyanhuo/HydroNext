import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';
import { ActionIcon, Avatar, Badge, Button, Group, Loader, Modal, Paper, ScrollArea, Stack, Text, Textarea, TextInput, UnstyledButton } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { TimeDisplay } from '@/components/common/time-display';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

function SendMessageDialog({
  opened,
  onClose,
  onSubmit,
  loading,
}: {
  opened: boolean;
  onClose: () => void;
  onSubmit: (uid: number) => void | Promise<void>;
  loading: boolean;
}) {
  const { t } = useI18n();
  const domainId = useSessionStore((s) => s.ui.domainId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!opened) {
      setQuery('');
      setResults([]);
      return;
    }
  }, [opened]);

  useEffect(() => {
    if (!opened) return undefined;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/d/${encodeURIComponent(domainId)}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            args: { search: trimmed, limit: 10 },
            projection: ['_id', 'uname', 'displayName', 'avatar'],
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          const users = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
          setResults(users.filter((u: any) => Number.isSafeInteger(Number(u._id))));
        }
      } catch {
        // ignore
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [domainId, opened, query]);

  return (
    <Modal opened={opened} onClose={onClose} title={t('New Message')} size="md">
      <Stack gap="md">
        <TextInput
          label={t('Search users')}
          placeholder={t('Type username or UID')}
          value={query}
          onChange={(e) => {
            const val = e.currentTarget.value;
            setQuery(val);
          }}
          rightSection={searching ? <Loader size={16} /> : null}
          autoFocus
        />
        {results.length > 0 && (
          <Paper withBorder p={0}>
            <ScrollArea.Autosize mah={300}>
              <Stack gap={0}>
                {results.map((u) => (
                  <UnstyledButton
                    key={u._id}
                    p="sm"
                    className="w-full hover:bg-[var(--hydro-surface-muted)] border-b border-[var(--hydro-border)] last:border-b-0"
                    onClick={() => onSubmit(u._id)}
                  >
                    <Group gap="sm">
                      <Avatar src={getAvatarUrl(u.avatar || '')} size="sm" radius="xl" />
                      <div>
                        <Text size="sm" fw={500}>{u.displayName || u.uname}</Text>
                        <Text size="xs" c="dimmed">UID {u._id}</Text>
                      </div>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Paper>
        )}
        {query.trim() && !searching && !results.length && (
          <Text c="dimmed" size="sm">{t('No users found')}</Text>
        )}
      </Stack>
    </Modal>
  );
}

function normalizeConversations(input: any, udict: Record<string, any>) {
  if (!input) return [];
  if (Array.isArray(input)) {
    const map = new Map<number, any>();
    for (const message of input) {
      const targetId = message.from;
      if (!map.has(targetId)) {
        map.set(targetId, {
          _id: targetId,
          udoc: udict[targetId] || { _id: targetId },
          messages: [],
        });
      }
      map.get(targetId).messages.push(message);
    }
    return Array.from(map.values());
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => conversations.find((c: any) => Number(c._id) === selectedId) || null,
    [conversations, selectedId],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected?.messages?.length]);

  const post = async (payload: Record<string, any>, successMessage: string) => {
    setLoading(String(payload.operation || 'operation'));
    setError('');
    try {
      const res = await fetch('/home/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Operation failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else window.location.reload();
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading('');
    }
  };

  const send = async () => {
    if (!selectedId || !draft.trim()) return;
    await post({ operation: 'send', uid: selectedId, content: draft }, t('Sent'));
  };

  const openConversation = (targetId: number) => {
    setSelectedId(targetId);
    setDraft('');
    setError('');
  };

  const target = selected?.udoc || {};
  const targetId = selectedId || 0;

  return (
    <Group gap={0} align="stretch" className="h-[calc(100vh-8rem)]">
      <Paper withBorder w={280} className="shrink-0 flex flex-col overflow-hidden">
        <Group justify="space-between" p="sm" className="border-b border-[var(--hydro-border)]">
          <Text fw={700} size="sm">{t('Messages')}</Text>
          <ActionIcon size="sm" variant="subtle" onClick={() => setDialogOpen(true)}>
            +
          </ActionIcon>
        </Group>
        <ScrollArea className="flex-1">
          {conversations.length === 0 ? (
            <Text c="dimmed" size="sm" p="md" ta="center">{t('No messages')}</Text>
          ) : (
            <Stack gap={0}>
              {conversations.map((conv: any) => {
                const other = conv.udoc || {};
                const otherId = Number(conv._id || other._id);
                const lastMsg = conv.messages?.[conv.messages.length - 1];
                const isActive = otherId === selectedId;
                return (
                  <UnstyledButton
                    key={otherId}
                    p="sm"
                    className={`border-b border-[var(--hydro-border)] hover:bg-[var(--hydro-surface-muted)] ${isActive ? 'bg-[var(--hydro-surface-muted)]' : ''}`}
                    onClick={() => openConversation(otherId)}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Avatar src={getAvatarUrl(other.avatar || '')} size="sm" radius="xl" />
                      <div className="min-w-0 flex-1">
                        <Group justify="space-between">
                          <Text size="sm" fw={500} truncate>{other.uname || otherId}</Text>
                          {lastMsg && (
                            <Text size="xs" c="dimmed" className="shrink-0">
                              <TimeDisplay date={lastMsg.createAt || lastMsg._id} format="relative" size="xs" />
                            </Text>
                          )}
                        </Group>
                        {lastMsg && (
                          <Text size="xs" c="dimmed" truncate>
                            {lastMsg.from === user?._id ? `${t('Me')}: ` : ''}{messageText(lastMsg)}
                          </Text>
                        )}
                      </div>
                    </Group>
                  </UnstyledButton>
                );
              })}
            </Stack>
          )}
        </ScrollArea>
      </Paper>

      <div className="flex-1 flex flex-col ml-0 border border-[var(--hydro-border)] rounded-r-md overflow-hidden">
        {selected ? (
          <>
            <Group gap="sm" p="sm" className="border-b border-[var(--hydro-border)] shrink-0">
              <Avatar src={getAvatarUrl(target.avatar || '')} size="sm" radius="xl" />
              <div>
                <Text size="sm" fw={600}>{target.uname || targetId}</Text>
                <Text size="xs" c="dimmed">UID {targetId}</Text>
              </div>
            </Group>

            <ScrollArea className="flex-1" p="md">
              <Stack gap="sm">
                {(selected.messages || []).map((message: any) => {
                  const fromMe = message.from === user?._id;
                  return (
                    <Group key={message._id} justify={fromMe ? 'flex-end' : 'flex-start'} align="flex-end" gap="xs">
                      {!fromMe && (
                        <Avatar src={getAvatarUrl(target.avatar || '')} size="xs" radius="xl" />
                      )}
                      <div className={`max-w-[70%] ${fromMe ? 'order-first' : ''}`}>
                        <Paper
                          p="xs"
                          radius="md"
                          bg={fromMe ? 'var(--hydro-primary)' : 'var(--hydro-surface-muted)'}
                          className={fromMe ? 'text-white' : ''}
                        >
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{messageText(message)}</Text>
                        </Paper>
                        <Group gap="xs" justify={fromMe ? 'flex-end' : 'flex-start'} mt={2}>
                          <TimeDisplay date={message.createAt || message._id} format="relative" size="xs" />
                          {fromMe && (
                            <Text
                              size="xs"
                              c="red"
                              className="cursor-pointer hover:underline"
                              onClick={() => post({ operation: 'delete_message', messageId: message._id }, t('Deleted'))}
                            >
                              {t('Delete')}
                            </Text>
                          )}
                        </Group>
                      </div>
                      {fromMe && (
                        <Avatar src={getAvatarUrl(user?.avatar || '')} size="xs" radius="xl" />
                      )}
                    </Group>
                  );
                })}
                <div ref={messagesEndRef} />
              </Stack>
            </ScrollArea>

            <Group gap="xs" p="sm" className="border-t border-[var(--hydro-border)] shrink-0">
              <Textarea
                placeholder={t('Write a message...')}
                value={draft}
                minRows={1}
                maxRows={4}
                autosize
                className="flex-1"
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setDraft(val);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button
                size="sm"
                disabled={!draft.trim()}
                loading={loading === 'send'}
                onClick={send}
              >
                {t('Send')}
              </Button>
            </Group>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState message={t('Select a conversation')} />
          </div>
        )}
        {error && <Text c="red" size="sm" p="sm">{error}</Text>}
      </div>

      <SendMessageDialog
        opened={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(uid) => {
          setDialogOpen(false);
          openConversation(uid);
        }}
        loading={loading === 'send'}
      />
    </Group>
  );
}
