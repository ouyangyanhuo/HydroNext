import './messages.css';

import {
  ActionIcon, Button, EmptyState, formatErrorMessage, formatUserName, getUserExtensionFields,
  TimeDisplay, UnstyledButton, useBuildUrl, useI18n, usePageData, UserAvatar, useSessionStore,
} from '@hydrooj/ui-next';
import { Group, Loader, Modal, Paper, ScrollArea, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconPlus, IconSend, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

function SendMessageDialog({
  opened,
  onClose,
  onSubmit,
  loading,
}: {
  opened: boolean;
  onClose: () => void;
  onSubmit: (user: any) => void | Promise<void>;
  loading: boolean;
}) {
  const { t } = useI18n();
  const domainId = useSessionStore((s) => s.ui.domainId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!opened) return undefined;
    const trimmed = query.trim();
    if (!trimmed) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/d/${encodeURIComponent(domainId)}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            args: { search: trimmed, limit: 10 },
            projection: ['_id', 'uname', 'displayName', 'avatar', 'avatarUrl', ...getUserExtensionFields()],
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          const users = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
          setResults(users.filter((u: any) => Number.isSafeInteger(Number(u._id))));
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') setResults([]);
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
    <Modal
      opened={opened}
      onClose={() => {
        setQuery('');
        setResults([]);
        onClose();
      }}
      title={t('New Message')}
      size="md"
    >
      <Stack gap="md">
        <TextInput
          label={t('Search users')}
          placeholder={t('Type username or UID')}
          value={query}
          onChange={(e) => {
            const val = e.currentTarget.value;
            setQuery(val);
            if (!val.trim()) {
              setResults([]);
              setSearching(false);
            }
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
                    className="hydro-messages__choice"
                    disabled={loading}
                    onClick={() => {
                      setQuery('');
                      setResults([]);
                      onSubmit(u);
                    }}
                  >
                    <Group gap="sm">
                      <UserAvatar user={u} link={false} size="sm" />
                      <div>
                        <Text size="sm" fw="var(--hydro-weight-medium)">{formatUserName(u)}</Text>
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

function getMessageTime(message: any) {
  const raw = message?.createAt || message?._id;
  const id = typeof raw === 'string' ? raw : raw?.$oid || raw?.toString?.();
  if (typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id)) {
    return Number.parseInt(id.slice(0, 8), 16) * 1000;
  }
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortConversations(items: any[]) {
  return [...items].sort((a, b) => {
    const aLast = a.messages?.[a.messages.length - 1];
    const bLast = b.messages?.[b.messages.length - 1];
    return getMessageTime(bLast) - getMessageTime(aLast);
  });
}

function normalizeConversations(input: any, udict: Record<string, any>, currentUserId?: number) {
  if (!input) return [];
  const finish = (items: any[]) => sortConversations(items.map((conv) => ({
    ...conv,
    messages: [...(conv.messages || [])].sort((a, b) => getMessageTime(a) - getMessageTime(b)),
  })));
  if (Array.isArray(input)) {
    const map = new Map<number, any>();
    for (const message of input) {
      const rawTarget = Number(message.from) === Number(currentUserId) ? message.to : message.from;
      const targetId = Number(Array.isArray(rawTarget) ? rawTarget[0] : rawTarget);
      if (!map.has(targetId)) {
        map.set(targetId, {
          _id: targetId,
          udoc: udict[targetId] || { _id: targetId },
          messages: [],
        });
      }
      map.get(targetId).messages.push(message);
    }
    return finish(Array.from(map.values()));
  }
  return finish(Object.values(input));
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

function normalizeMessageId(id: any) {
  if (typeof id === 'string') return id;
  if (id?.$oid) return id.$oid;
  if (id?.toString) return id.toString();
  return String(Date.now());
}

export default function HomeMessagesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const user = useSessionStore((s) => s.user);
  const udict = useMemo(() => args.udict || {}, [args.udict]);
  const initialConversations = useMemo(() => normalizeConversations(args.messages, udict, user?._id), [args.messages, udict, user?._id]);
  const [conversations, setConversations] = useState<any[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(initialConversations[0]?._id) || null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [error, setError] = useState('');
  const sending = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    const existing = conversations.find((c: any) => Number(c._id) === selectedId);
    if (existing) return existing;
    if (!selectedId) return null;
    return {
      _id: selectedId,
      udoc: selectedUser || udict[selectedId] || { _id: selectedId },
      messages: [],
    };
  }, [conversations, selectedId, selectedUser, udict]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedId, selected?.messages?.length]);

  const post = async (payload: Record<string, any>) => {
    setLoading(String(payload.operation || 'operation'));
    setError('');
    try {
      const res = await fetch(buildUrl('home_messages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : null;
      if (!data || typeof data !== 'object' || (payload.operation === 'send' && !data.mdoc && !data.error)) {
        setError(t('Operation failed'));
        return null;
      }
      if (!res.ok || data.error) {
        setError(formatErrorMessage(data.error, t('Operation failed')));
        return null;
      }
      return data;
    } catch (err: any) {
      setError(err?.message || t('Network error'));
      return null;
    } finally {
      setLoading('');
    }
  };

  const send = async () => {
    if (sending.current || loading || !selectedId || !draft.trim()) return;
    sending.current = true;
    const content = draft.trim();
    setDraft('');
    const data = await post({ operation: 'send', uid: selectedId, content });
    sending.current = false;
    if (data === null) {
      setDraft(content);
      return;
    }
    const targetUser = data.udoc || selected?.udoc || selectedUser || { _id: selectedId };
    const nextMessage = data.mdoc;
    setSelectedUser(targetUser);
    setConversations((prev) => {
      const next = [...prev];
      const index = next.findIndex((conv) => Number(conv._id) === selectedId);
      const conv = index >= 0
        ? { ...next[index] }
        : { _id: selectedId, udoc: targetUser, messages: [] };
      conv.udoc = { ...(conv.udoc || {}), ...targetUser };
      conv.messages = [...(conv.messages || []), nextMessage].sort((a, b) => getMessageTime(a) - getMessageTime(b));
      if (index >= 0) next.splice(index, 1);
      next.unshift(conv);
      return next;
    });
  };

  const deleteMessage = async (messageId: any) => {
    const normalizedId = normalizeMessageId(messageId);
    setDeletingMessageId(normalizedId);
    const data = await post({ operation: 'delete_message', messageId });
    setDeletingMessageId('');
    if (data === null) return;
    setConversations((prev) => sortConversations(prev.map((conv) => (
      Number(conv._id) === selectedId
        ? { ...conv, messages: (conv.messages || []).filter((message: any) => normalizeMessageId(message._id) !== normalizedId) }
        : conv
    ))));
  };

  const openConversation = (targetId: number, targetUser: any = null) => {
    setSelectedId(targetId);
    setSelectedUser(targetUser);
    setDraft('');
    setError('');
  };

  const target = selected?.udoc || {};
  const targetId = selectedId || 0;

  return (
    <main className="hydro-messages">
      <Paper className="hydro-messages__sidebar">
        <Group justify="space-between" p="sm" className="hydro-messages__header">
          <Text fw={700} size="sm">{t('Messages')}</Text>
          <ActionIcon size="sm" variant="subtle" aria-label={t('New Message')} disabled={!!loading} onClick={() => setDialogOpen(true)}>
            <IconPlus size={17} />
          </ActionIcon>
        </Group>
        <ScrollArea className="hydro-messages__grow">
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
                    className="hydro-messages__choice"
                    data-active={isActive || undefined}
                    disabled={!!loading}
                    onClick={() => openConversation(otherId, other)}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <UserAvatar user={other} link={false} size={40} className="hydro-message-avatar" />
                      <div className="hydro-messages__grow">
                        <Group justify="space-between">
                          <Text size="sm" fw="var(--hydro-weight-medium)" truncate>{formatUserName(other) || otherId}</Text>
                          {lastMsg && (
                            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                              <TimeDisplay date={lastMsg.createAt || lastMsg._id} format="relative" size="xs" />
                            </Text>
                          )}
                        </Group>
                        {lastMsg && (
                          <Text size="xs" c="dimmed" truncate>
                            {Number(lastMsg.from) === Number(user?._id) ? `${t('Me')}: ` : ''}{messageText(lastMsg)}
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

      <section className="hydro-messages__chat">
        {selected ? (
          <>
            <Group gap="sm" p="sm" className="hydro-messages__header">
              <UserAvatar user={target} link={false} size={36} className="hydro-message-avatar" />
              <div>
                <Text size="sm" fw="var(--hydro-weight-semibold)">{formatUserName(target) || targetId}</Text>
                <Text size="xs" c="dimmed">UID {targetId}</Text>
              </div>
            </Group>

            <div className="hydro-messages__timeline">
              <Stack gap="sm" justify="flex-end" style={{ minHeight: '100%' }}>
                {(selected.messages || []).map((message: any) => {
                  const fromMe = Number(message.from) === Number(user?._id);
                  return (
                    <Group key={message._id} justify={fromMe ? 'flex-end' : 'flex-start'} align="flex-end" gap="xs">
                      {!fromMe && (
                        <UserAvatar user={target} link={false} size={30} className="hydro-message-avatar" />
                      )}
                      <div className="hydro-message-content" style={fromMe ? { order: -1 } : undefined}>
                        <Paper
                          p="xs"
                          radius="md"
                          bg={fromMe ? 'var(--hydro-primary)' : 'var(--hydro-surface-muted)'}
                          className={fromMe ? 'hydro-message-bubble hydro-message-bubble--mine' : 'hydro-message-bubble'}
                        >
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{messageText(message)}</Text>
                        </Paper>
                        <Group gap="xs" justify={fromMe ? 'flex-end' : 'flex-start'} mt={2}>
                          <TimeDisplay date={message.createAt || message._id} format="relative" size="xs" />
                          {fromMe && (
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color="red"
                              loading={deletingMessageId === normalizeMessageId(message._id)}
                              aria-label={t('Delete')}
                              className="hydro-message-delete"
                              disabled={!!loading}
                              onClick={() => deleteMessage(message._id)}
                            >
                              <IconTrash size={12} />
                            </ActionIcon>
                          )}
                        </Group>
                      </div>
                      {fromMe && (
                        <UserAvatar user={user} link={false} size={30} className="hydro-message-avatar" />
                      )}
                    </Group>
                  );
                })}
                <div ref={messagesEndRef} />
              </Stack>
            </div>

            <Group gap="xs" p="sm" className="hydro-messages__composer">
              <Textarea
                placeholder={t('Write a message...')}
                value={draft}
                disabled={!!loading}
                minRows={1}
                maxRows={4}
                autosize
                className="hydro-messages__grow"
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setDraft(val);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button
                size="sm"
                leftSection={<IconSend size={15} />}
                disabled={!!loading || !draft.trim()}
                loading={loading === 'send'}
                onClick={send}
              >
                {t('Send')}
              </Button>
            </Group>
          </>
        ) : (
          <div className="hydro-messages__empty">
            <EmptyState message={t('Select a conversation')} />
          </div>
        )}
        {error && <Text c="red" size="sm" p="sm">{error}</Text>}
      </section>

      <SendMessageDialog
        opened={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(targetUser) => {
          setDialogOpen(false);
          openConversation(Number(targetUser._id), targetUser);
        }}
        loading={loading === 'send'}
      />
    </main>
  );
}
