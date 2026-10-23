import { Badge, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { IconSpeakerphone } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { useWebSocket } from '@/hooks/use-websocket';
import { formatErrorMessage } from '@/utils/error';
import { ProctorFinishButton } from './proctor-finish-button';

interface Announcement {
  _id: string;
  domainId: string;
  tid: string;
  title: string;
  content: string;
  createdAt: string;
  kind?: 'contest-ended' | 'team-ended' | 'participation-ended';
  endAt?: string;
  proctorEnabled?: boolean;
}

/** Mounted in the shell, not the contest route: participants can receive announcements on any page. */
export function ContestAnnouncements() {
  const { t } = useI18n();
  const { args, name, url } = usePageData();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const tid = String(args.tdoc?.docId || args.tdoc?._id || '');
  const domainId = args.UiContext?.domainId;
  const participationPage = ['problem_detail', 'problem_submit', 'contest_detail', 'contest_problemlist', 'contest_clarification'].includes(name);
  const belongsToCurrentContest = useCallback((item: Announcement) => participationPage && item.domainId === domainId && item.tid === tid,
    [participationPage, domainId, tid]);
  const refreshed = useRef(new Set<string>());
  const returnAfterAck = useRef<Announcement | null>(null);
  const returning = useRef(false);
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
        returnAfterAck.current = null;
        setConfirming(false);
        setError(formatErrorMessage(data.error, t('Operation failed')));
        return;
      }
      if (!Array.isArray(data?.announcements)) return;
      const next = data.announcements.filter((item: Announcement) => (
        item && /^[a-f\d]{24}$/i.test(item._id) && typeof item.content === 'string'
        && typeof item.title === 'string' && typeof item.domainId === 'string'
      ));
      setItems(next);
      const acknowledged = returnAfterAck.current;
      if (acknowledged && !next.some((item: Announcement) => item._id === acknowledged._id)) {
        returnAfterAck.current = null;
        // A permission refresh may have turned the problem into a 403 page.
        // Still return to the overview, but never redirect an unrelated page.
        if (belongsToCurrentContest(acknowledged) || refreshed.current.has(`${acknowledged._id}/${url}`)) {
          returning.current = true;
          void navigate(buildUrl('contest_detail', { domainId: acknowledged.domainId, tid: acknowledged.tid }), { replace: true })
            .finally(() => { returning.current = false; });
        }
      }
      setConfirming(false);
      setError('');
    },
  });
  const current = items[0];
  useEffect(() => {
    if (returning.current) return;
    const ended = items.filter((item) => item.kind && belongsToCurrentContest(item) && !refreshed.current.has(`${item._id}/${url}`));
    if (!ended.length) return;
    ended.forEach((item) => refreshed.current.add(`${item._id}/${url}`));
    // Refresh authoritative permissions without unmounting the editor or losing its draft.
    // A stale unread notice cannot force a contest that an administrator reopened to end again.
    void navigate(window.location.href, { replace: true, preservePage: true });
  }, [items, belongsToCurrentContest, url, navigate]);

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
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {current.kind ? t(current.content) : current.content}
            </Text>
            {current.kind && current.proctorEnabled && (
              <Text size="sm" mt="sm">
                {t('End proctoring and upload your log in the client. Ending the contest does not upload it automatically.')}
              </Text>
            )}
          </ScrollArea.Autosize>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">{connected ? `${items.length} ${t('Unread announcements')}` : t('Reconnecting…')}</Text>
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <Button
                loading={confirming}
                disabled={!connected}
                onClick={() => {
                  returnAfterAck.current = current.kind ? current : null;
                  setConfirming(true);
                  send({ operation: 'acknowledge', id: current._id });
                }}
              >
                {t(current.kind && current.proctorEnabled ? 'Skip upload for now' : 'I understand')}
              </Button>
              {current.kind && current.proctorEnabled && <ProctorFinishButton label={t('End and upload')} />}
            </Group>
          </Group>
          {error && <Text size="sm" c="red" role="alert">{error}</Text>}
        </Stack>
      )}
    </Modal>
  );
}
