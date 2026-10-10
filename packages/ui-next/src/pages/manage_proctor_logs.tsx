import { Card, Checkbox, Group, Pagination, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { proctorError, proctorRequest } from '@/utils/proctor';

export function ProctorLogsPanel({ args }: { args: any }) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const allowed = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState(args);
  const [q, setQ] = useState(args.q || '');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const logs: any[] = data.logs || [];
  const read = async (page: number, query: string, pageSize: number) => {
    const url = buildUrl('manage_proctor_logs', {}, { page: String(page), q: query.trim(), pageSize: String(pageSize) });
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok || result.error || !Array.isArray(result.logs)) throw new Error(proctorError(result.error));
    setData(result);
    setSelected([]);
  };
  const load = async (page: number, query = data.q || '', pageSize = data.pageSize || 25) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await read(page, query, pageSize);
    } catch (error: any) {
      notifications.show({ title: t('Operation failed'), message: t(error.message || 'Operation failed'), color: 'red' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const act = async (operation: string, ids: string[]) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const url = buildUrl('manage_proctor_logs');
      if (operation === 'delete') {
        await proctorRequest(url, { operation, ids });
        setDeleting(false);
        await read(data.page || 1, data.q || '', data.pageSize || 25);
      } else {
        const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, ids }) });
        if (response.headers.get('content-type')?.includes('json')) {
          const responseData = await response.json();
          throw new Error(proctorError(responseData.error, 'Log download failed.'));
        }
        if (!response.ok) throw new Error('Log download failed.');
        const objectUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = ids.length === 1 ? logs.find((log) => log._id === ids[0])?.filename || 'proctor.hplog' : 'proctor-logs.zip';
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch (error: any) {
      notifications.show({ title: t('Operation failed'), message: t(error.message || 'Operation failed'), color: 'red' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (!allowed) return <Text>{t('Access Denied')}</Text>;
  return <Stack gap="lg">
    <Card withBorder className="hydro-content-card" p="lg"><Stack gap="md">
      <Title order={3}>{t('Proctor logs')}</Title>
      <form onSubmit={(event) => { event.preventDefault(); void load(1, q); }}>
        <Group><TextInput
          className="flex-1"
          placeholder={t('Search filename, user, domain or contest')}
          value={q}
          disabled={busy}
          onChange={(event) => setQ(event.currentTarget.value)}
          maxLength={80} />
        <Button type="submit" variant="light" loading={busy}>{t('Search')}</Button></Group>
      </form>
      <Group justify="space-between"><Text size="sm" c="dimmed">{t('Encrypted final logs.')} · {data.count || 0}</Text>
        <Group gap="sm"><Button variant="light" loading={busy} disabled={!selected.length} onClick={() => void act('download', selected)}>{t('Download selected')}</Button>
          <Button color="red" variant="light" disabled={busy || !selected.length} onClick={() => setDeleting(true)}>{t('Delete selected')}</Button></Group>
      </Group>
      <Table.ScrollContainer minWidth={850}><Table highlightOnHover><Table.Thead><Table.Tr>
        <Table.Th><Checkbox
          aria-label={t('Select all')}
          disabled={busy || !logs.length}
          checked={!!logs.length && selected.length === logs.length}
          indeterminate={selected.length > 0 && selected.length < logs.length}
          onChange={(event) => setSelected(event.currentTarget.checked ? logs.map((log) => log._id) : [])} /></Table.Th>
        {['Filename', 'User', 'Upload time', 'Domain', 'Contest', 'Size', 'Actions'].map((key) => <Table.Th key={key}>{t(key)}</Table.Th>)}
      </Table.Tr></Table.Thead><Table.Tbody>{logs.map((log) => <Table.Tr key={log._id}>
        <Table.Td><Checkbox
          aria-label={`${t('Select')} ${log.filename}`}
          checked={selected.includes(log._id)}
          disabled={busy}
          onChange={(event) => setSelected(event.currentTarget.checked ? [...selected, log._id] : selected.filter((id) => id !== log._id))} /></Table.Td>
        <Table.Td>{log.filename}</Table.Td><Table.Td>{log.username}</Table.Td><Table.Td>{new Date(log.uploadedAt).toLocaleString()}</Table.Td>
        <Table.Td>{log.domainName} <Text size="xs" c="dimmed">{log.domainId}</Text></Table.Td>
        <Table.Td><Link to="contest_detail" params={{ domainId: log.domainId, tid: log.tid }}>{log.contestTitle}</Link></Table.Td>
        <Table.Td>{(log.size / 1024 / 1024).toFixed(2)} MiB</Table.Td>
        <Table.Td><Group gap="xs" wrap="nowrap"><Button size="xs" variant="light" disabled={busy} onClick={() => void act('download', [log._id])}>{t('Download')}</Button>
          <Button size="xs" color="red" variant="subtle" disabled={busy} onClick={() => { setSelected([log._id]); setDeleting(true); }}>{t('Delete')}</Button></Group></Table.Td>
      </Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
      {!logs.length && <Text ta="center" c="dimmed" py="xl">{t('No proctor logs yet.')}</Text>}
      <Group justify="space-between" className="hydro-paginator" wrap="wrap">
        <Group gap="xs" wrap="nowrap"><Text size="xs" c="dimmed">{t('Rows per page')}</Text>
          <Select
            aria-label={t('Rows per page')}
            data={['25', '50']}
            value={String(data.pageSize || 25)}
            size="xs"
            w={76}
            disabled={busy}
            allowDeselect={false}
            onChange={(value) => { if (value) void load(1, data.q || '', Number(value)); }} />
        </Group>
        <Group gap="xs"><Pagination
          value={data.page || 1}
          total={data.pageCount || 1}
          size="sm"
          disabled={busy}
          onChange={(page) => void load(page)} />
        <Text size="xs" c="dimmed">{t('Page {0} of {1}').replace('{0}', String(data.page || 1)).replace('{1}', String(data.pageCount || 1))}</Text>
        </Group>
      </Group>
    </Stack></Card>
    <ConfirmDialog
      opened={deleting}
      onClose={() => setDeleting(false)}
      loading={busy}
      title={t('Delete selected')}
      message={t('Deleting logs invalidates the corresponding contest results until logs are uploaded again. Continue?')}
      onConfirm={() => void act('delete', selected)} />
  </Stack>;
}

export default function ManageProctorLogsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const key = `${args.page}:${args.q}:${(args.logs || []).map((log: any) => log._id).join(',')}`;
  return <Stack gap="lg">
    <PageHeader title={t('Proctor logs')}><Button component={Link} to="manage_proctor" variant="light">{t('Proctor settings')}</Button></PageHeader>
    <ProctorLogsPanel key={key} args={args} />
  </Stack>;
}
