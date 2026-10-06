import { Badge, Group, Paper, Stack, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import yaml from 'js-yaml';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { FormDialog } from '@/components/common/form-dialog';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
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
  const result: Record<string, { color: string, name: string }> = {};
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
  const [data, setData] = useState(args);
  const tdoc = data.tdoc || {};
  const bdocs = data.bdocs || data.balloons || [];
  const pdict = data.pdict || {};
  const udict = data.udict || {};
  const tid = tdoc.docId || tdoc._id;
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<Record<string, { color: string, name: string }>>(() => makeBalloonDraft(tdoc));
  const [loading, setLoading] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(async (signal: AbortSignal) => {
    const res = await fetch(window.location.href, { headers: { Accept: 'application/json' }, signal });
    const next = await res.json();
    if (!res.ok || next.error || !next.tdoc || !Array.isArray(next.bdocs)) {
      throw new Error(formatErrorMessage(next.error, t('Failed')));
    }
    if (!signal.aborted) {
      setData(next);
      setRefreshError('');
    }
  }, [t]);

  useEffect(() => () => pending.current?.abort(), []);

  useEffect(() => {
    // Opening the editor also aborts an in-flight refresh. Drafts are never
    // replaced by background navigation or a late refresh response.
    if (opened || loading) return undefined;
    let request: AbortController | null = null;
    const beginAt = new Date(tdoc.beginAt).getTime();
    const endAt = new Date(tdoc.endAt).getTime();
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (!(beginAt <= now) || !(now <= endAt) || request || pending.current) return;
      const controller = new AbortController();
      request = controller;
      void refresh(controller.signal).catch((err) => {
        if (!controller.signal.aborted) setRefreshError(formatErrorMessage(err, t('Failed')));
      }).finally(() => { request = null; });
    }, 60000);
    return () => {
      window.clearInterval(timer);
      request?.abort();
    };
  }, [opened, loading, refresh, t, tdoc.beginAt, tdoc.endAt]);

  const post = async (payload: Record<string, any>, successMessage: string) => {
    if (pending.current) return false;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(payload.operation);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(formatErrorMessage(result.error, t('Failed')));
      if (controller.signal.aborted) return false;
      notifications.show({ title: successMessage, message: '', color: 'green' });
      // A failed refresh must not turn a successful write into a failed save.
      try {
        await refresh(controller.signal);
      } catch (err: any) {
        if (!controller.signal.aborted) setRefreshError(formatErrorMessage(err, t('Failed')));
      }
      return !controller.signal.aborted;
    } catch (err: any) {
      if (!controller.signal.aborted) notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
      return false;
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setLoading('');
    }
  };

  const saveColor = async () => {
    if (!await post({ operation: 'set_color', color: yaml.dump(draft) }, t('Successfully updated.'))) return;
    setData((current) => ({ ...current, tdoc: { ...current.tdoc, balloon: draft } }));
    setOpened(false);
  };

  const updateDraft = (pid: number, field: 'color' | 'name', value: string) => {
    setDraft((current) => ({
      ...current,
      [pid]: { ...(current[String(pid)] || { color: '#ffffff', name: '' }), [field]: value },
    }));
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Balloon Status')} - ${tdoc.title}`}>
        <Group gap="xs">
          <Button size="xs" disabled={!!loading} onClick={() => { setDraft(makeBalloonDraft(tdoc)); setOpened(true); }}>{t('Set Color')}</Button>
          <Button component={Link} to="contest_manage" params={{ tid }} size="xs" variant="subtle">{t('Contest Management')}</Button>
        </Group>
      </PageHeader>
      {refreshError && <Text size="sm" c="red" role="alert">{refreshError}</Text>}

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
                            disabled={!!loading}
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

      <FormDialog
        opened={opened}
        onClose={() => setOpened(false)}
        title={t('Set Color')}
        size="lg"
        fields={[]}
        onSubmit={saveColor}
        confirmLabel={t('Save')}
        loading={!!loading}
      >
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
                        onChange={(event) => updateDraft(pid, 'color', event.currentTarget.value)}
                      />
                      <TextInput
                        value={draft[String(pid)]?.color || '#ffffff'}
                        onChange={(event) => updateDraft(pid, 'color', event.currentTarget.value)}
                      />
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={draft[String(pid)]?.name || ''}
                      onChange={(event) => updateDraft(pid, 'name', event.currentTarget.value)}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </FormDialog>
    </Stack>
  );
}
