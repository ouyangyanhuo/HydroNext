import { Badge, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { IconSpeakerphone } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';
import { useWebSocket } from '@/hooks/use-websocket';
import { formatErrorMessage } from '@/utils/error';

interface Announcement {
  _id: string;
  domainId: string;
  tid: string;
  title: string;
  content: string;
  createdAt: string;
}

/** Mounted in the shell, not the contest route: participants can receive announcements on any page. */
export function ContestAnnouncements() {
  const { t } = useI18n();
  const [items, setItems] = useState<Announcement[]>([]);
  const [connected, setConnected] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const { send } = useWebSocket({
    url: 'contest-announcements-conn',
    onOpen: () => setConnected(true),
    onClose: () => { setConnected(false); setConfirming(false); },
    onMessage: (data) => {
      if (data?.error) {
        setConfirming(false);
        setError(formatErrorMessage(data.error, t('Operation failed')));
        return;
      }
      if (!Array.isArray(data?.announcements)) return;
      setItems(data.announcements.filter((item: Announcement) => (
        item && /^[a-f\d]{24}$/i.test(item._id) && typeof item.content === 'string'
        && typeof item.title === 'string' && typeof item.domainId === 'string'
      )));
      setConfirming(false);
      setError('');
    },
  });
  const current = items[0];

  return (
    <Modal
      opened={!!current}
      onClose={() => {}}
      title={<Group gap="xs"><IconSpeakerphone size={20} /><Text fw={700}>{t('Contest announcement')}</Text></Group>}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      zIndex={2000}
    >
      {current && (
        <Stack gap="md">
          <div>
            <Text fw={700}>{current.title}</Text>
            <Group gap="xs" mt={6}>
              <Badge variant="light">{current.domainId}</Badge>
              <Text size="xs" c="dimmed">{new Date(current.createdAt).toLocaleString()}</Text>
            </Group>
          </div>
          <ScrollArea.Autosize mah="50vh" type="auto">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{current.content}</Text>
          </ScrollArea.Autosize>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">{connected ? `${items.length} ${t('Unread announcements')}` : t('Reconnecting…')}</Text>
            <Button
              loading={confirming}
              disabled={!connected}
              onClick={() => { setConfirming(true); send({ operation: 'acknowledge', id: current._id }); }}
            >
              {t('I understand')}
            </Button>
          </Group>
          {error && <Text size="sm" c="red" role="alert">{error}</Text>}
        </Stack>
      )}
    </Modal>
  );
}
