import yaml from 'js-yaml';
import { Badge, Button, Group, Modal, Paper, Stack, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
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

function makeBalloonDraft(tdoc: any) {
  const result: Record<string, { color: string; name: string }> = {};
  for (const pid of tdoc.pids || []) {
    result[String(pid)] = {
      color: tdoc.balloon?.[pid]?.color || '#ffffff',
      name: tdoc.balloon?.[pid]?.name || '',
    };
  }
  return result;
}

export default function ContestBalloonPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const tdoc = args.tdoc || {};
  const bdocs = args.bdocs || args.balloons || [];
  const pdict = args.pdict || {};
  const udict = args.udict || {};
  const tid = tdoc.docId || tdoc._id;
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<Record<string, { color: string; name: string }>>(() => makeBalloonDraft(tdoc));
  const [loading, setLoading] = useState('');

  useEffect(() => {
    const beginAt = new Date(tdoc.beginAt).getTime();
    const endAt = new Date(tdoc.endAt).getTime();
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (beginAt <= now && now <= endAt) navigate(window.location.pathname + window.location.search);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [navigate, tdoc.beginAt, tdoc.endAt]);

  const post = async (payload: Record<string, any>, successMessage: string) => {
    setLoading(payload.operation);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed')));
      notifications.show({ title: successMessage, message: '', color: 'green' });
      navigate(window.location.pathname + window.location.search);
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setLoading('');
    }
  };

  const saveColor = async () => {
    await post({ operation: 'set_color', color: yaml.dump(draft) }, t('Successfully updated.'));
    setOpened(false);
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Balloon Status')} - ${tdoc.title}`}>
        <Group gap="xs">
          <Button size="xs" onClick={() => { setDraft(makeBalloonDraft(tdoc)); setOpened(true); }}>{t('Set Color')}</Button>
          <Button component={Link} to="contest_manage" params={{ tid }} size="xs" variant="subtle">{t('Contest Management')}</Button>
        </Group>
      </PageHeader>

      {!tdoc.balloon || Object.keys(tdoc.balloon).length === 0 ? (
        <Paper withBorder p="xl">
          <Text c="dimmed" ta="center">{t('Please set the balloon color for each problem first.')}</Text>
        </Paper>
      ) : (
        <Paper withBorder className="overflow-hidden">
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('Status')}</Table.Th>
                <Table.Th>{t('#')}</Table.Th>
                <Table.Th>{t('Problem')}</Table.Th>
                <Table.Th>{t('Submit By')}</Table.Th>
                <Table.Th>{t('Send By')}</Table.Th>
                <Table.Th>{t('Awards')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {bdocs.length ? bdocs.map((bdoc: any) => {
                const index = (tdoc.pids || []).indexOf(bdoc.pid);
                const balloon = tdoc.balloon?.[bdoc.pid] || {};
                return (
                  <Table.Tr key={bdoc._id}>
                    <Table.Td>
                      <Badge size="xs" color={bdoc.sent ? 'green' : 'yellow'} variant="light">
                        {bdoc.sent ? t('Sent') : t('Waiting')}
                      </Badge>
                    </Table.Td>
                    <Table.Td><Text size="xs" ff="monospace">{String(bdoc._id).slice(-8)}</Text></Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {!bdoc.sent && (
                          <Button
                            size="compact-xs"
                            variant="light"
                            loading={loading === 'done'}
                            onClick={() => post({ operation: 'done', balloon: bdoc._id }, t('Successfully updated.'))}
                          >
                            {t('Send')}
                          </Button>
                        )}
                        <Text size="sm" fw={700} style={{ color: balloon.color || undefined }}>
                          {index >= 0 ? alphabetic(index) : bdoc.pid} {balloon.name ? `(${balloon.name})` : ''}
                        </Text>
                        {pdict[bdoc.pid]?.title && <Text size="xs" c="dimmed">{pdict[bdoc.pid].title}</Text>}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{udict[bdoc.uid]?.uname || bdoc.uid}</Text>
                      <TimeDisplay date={bdoc._id} format="relative" size="xs" />
                    </Table.Td>
                    <Table.Td>
                      {bdoc.sent ? (
                        <>
                          <Text size="sm">{udict[bdoc.sent]?.uname || bdoc.sent}</Text>
                          {bdoc.sentAt && <TimeDisplay date={bdoc.sentAt} format="relative" size="xs" />}
                        </>
                      ) : <Text size="xs" c="dimmed">-</Text>}
                    </Table.Td>
                    <Table.Td><Text size="xs">{bdoc.first ? t('First of Problem') : '-'}</Text></Table.Td>
                  </Table.Tr>
                );
              }) : (
                <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed" ta="center" py="lg">{t('No data')}</Text></Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <Modal opened={opened} onClose={() => setOpened(false)} title={t('Set Color')} size="lg">
        <Stack gap="md">
          <Paper withBorder className="overflow-hidden">
            <Table>
              <Table.Thead>
                <Table.Tr><Table.Th>{t('Problem')}</Table.Th><Table.Th>{t('Color')}</Table.Th><Table.Th>{t('Name')}</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(tdoc.pids || []).map((pid: number, index: number) => (
                  <Table.Tr key={pid}>
                    <Table.Td><Text size="sm" fw={700}>{alphabetic(index)}</Text></Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <input
                          type="color"
                          value={draft[String(pid)]?.color || '#ffffff'}
                          onChange={(event) => setDraft((current) => ({ ...current, [pid]: { ...(current[String(pid)] || { name: '' }), color: event.currentTarget.value } }))}
                        />
                        <TextInput
                          value={draft[String(pid)]?.color || '#ffffff'}
                          onChange={(event) => setDraft((current) => ({ ...current, [pid]: { ...(current[String(pid)] || { name: '' }), color: event.currentTarget.value } }))}
                        />
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        value={draft[String(pid)]?.name || ''}
                        onChange={(event) => setDraft((current) => ({ ...current, [pid]: { ...(current[String(pid)] || { color: '#ffffff' }), name: event.currentTarget.value } }))}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setOpened(false)}>{t('Cancel')}</Button>
            <Button onClick={saveColor} loading={loading === 'set_color'}>{t('Save')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
