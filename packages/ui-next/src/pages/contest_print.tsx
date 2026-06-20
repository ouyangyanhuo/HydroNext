import { Badge, Button, Group, Paper, Stack, Table, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { FileDropzone } from '@/components/common/file-dropzone';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { PERM, useHasPerm } from '@/hooks/use-permission';
import { formatErrorMessage } from '@/utils/error';

function printPlainTask(task: any, udoc: any) {
  const printWindow = window.open('', '_blank', 'width=800,height=600,popup=1');
  if (!printWindow) return;
  const lines = String(task.content || '').split('\n');
  let count = 0;
  const content = lines.filter((line) => {
    count += Math.ceil(line.length / 100) || 1;
    return count <= 300;
  }).join('\n');
  printWindow.document.write(`<!doctype html><html><head><title>${task.title}</title><style>
    body{font-family:monospace;margin:10px;font-size:14px;line-height:1.2}
    .header{border-bottom:1px solid #ccc;margin-bottom:8px}
    pre{white-space:pre-wrap}
  </style></head><body>
    <div class="header">[${udoc?.uname || task.owner}] ${udoc?.school || ''} ${udoc?.displayName || ''}<br>Filename: ${task.title}</div>
    <pre>${content.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] || ch))}</pre>
  </body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 300);
}

export default function ContestPrintPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const tdoc = args.tdoc || {};
  const tid = tdoc.docId || tdoc._id;
  const canEdit = useHasPerm(PERM.PERM_EDIT_CONTEST) || args.canEdit;
  const [title, setTitle] = useState('print.txt');
  const [content, setContent] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [udict, setUdict] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState('');

  const post = async (payload: Record<string, any>, fallback = t('Failed')) => {
    const res = await fetch(window.location.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, fallback));
    return data;
  };

  const loadTasks = async () => {
    try {
      const data = await post({ operation: 'get_print_task' });
      setTasks(data.tasks || []);
      setUdict(data.udict || {});
    } catch {
      // The page itself still works when task polling is unavailable.
    }
  };

  useEffect(() => {
    loadTasks();
    const timer = window.setInterval(loadTasks, 10000);
    return () => window.clearInterval(timer);
  }, []);

  const submitText = async () => {
    if (!content.trim()) return;
    setLoading('print');
    try {
      await post({ operation: 'print', title: title || 'print.txt', content }, t('Failed'));
      notifications.show({ title: t('Submitted'), message: '', color: 'green' });
      setContent('');
      await loadTasks();
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setLoading('');
    }
  };

  const updateTask = async (taskId: string, status: 'printed' | 'pending') => {
    setLoading(taskId);
    try {
      await post({ operation: 'update_print_task', taskId, status }, t('Failed'));
      await loadTasks();
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setLoading('');
    }
  };

  const allocateAndPrint = async () => {
    setLoading('allocate');
    try {
      const data = await post({ operation: 'allocate_print_task' }, t('Failed'));
      if (!data.task) {
        notifications.show({ title: t('No pending print tasks.'), message: '', color: 'gray' });
        return;
      }
      printPlainTask(data.task, data.udoc);
      await post({ operation: 'update_print_task', taskId: data.task._id, status: 'printed' }, t('Failed'));
      await loadTasks();
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setLoading('');
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Print Request')} - ${tdoc.title}`}>
        <Group gap="xs">
          {canEdit && <Button size="xs" onClick={allocateAndPrint} loading={loading === 'allocate'}>{t('Enable Print Kiosk')}</Button>}
          <Button component={Link} to="contest_detail" params={{ tid }} size="xs" variant="subtle">{t('Contest Detail')}</Button>
        </Group>
      </PageHeader>

      <Paper withBorder p="lg">
        <Stack gap="md">
          <Text size="sm" fw={800}>{t('Print New File')}</Text>
          <TextInput label={t('Filename')} value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          <Textarea label={t('Content')} value={content} onChange={(event) => setContent(event.currentTarget.value)} minRows={10} autosize />
          <Group justify="space-between" align="flex-end">
            <div className="w-full max-w-md">
              <FileDropzone
                action={window.location.href}
                fields={{ operation: 'print' }}
                multiple={false}
                maxSize={1024 * 1024}
                onComplete={() => { notifications.show({ title: t('Submitted'), message: '', color: 'green' }); loadTasks(); }}
                onError={(message) => notifications.show({ title: message, message: '', color: 'red' })}
              />
            </div>
            <Button onClick={submitText} loading={loading === 'print'}>{t('Send to Printer')}</Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder className="overflow-hidden">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('User')}</Table.Th>
              <Table.Th>{t('Title')}</Table.Th>
              <Table.Th>{t('Time')}</Table.Th>
              <Table.Th>{t('Status')}</Table.Th>
              {canEdit && <Table.Th>{t('Action')}</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tasks.length ? tasks.map((task) => (
              <Table.Tr key={task._id}>
                <Table.Td><Text size="sm">{udict[task.owner]?.uname || task.owner}</Text></Table.Td>
                <Table.Td><Text size="sm">{task.title}</Text></Table.Td>
                <Table.Td><TimeDisplay date={task._id} format="relative" size="xs" /></Table.Td>
                <Table.Td><Badge size="xs" variant="light">{task.status}</Badge></Table.Td>
                {canEdit && (
                  <Table.Td>
                    <Button size="compact-xs" variant="subtle" loading={loading === task._id} onClick={() => updateTask(task._id, 'pending')}>
                      {t('Re-Print')}
                    </Button>
                  </Table.Td>
                )}
              </Table.Tr>
            )) : (
              <Table.Tr><Table.Td colSpan={canEdit ? 5 : 4}><Text size="sm" c="dimmed" ta="center" py="md">{t('No pending print tasks.')}</Text></Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
