import { formatErrorMessage } from '@/utils/error';
import { Button, Checkbox, Group, Paper, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { FileDropzone } from '@/components/common/file-dropzone';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

function formatSize(size: number) {
  if (!Number.isFinite(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function HomeFilesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const user = useSessionStore((s) => s.user);
  const files = args.files || args.udocs || [];
  const uid = args.uid || user?._id;
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const toggle = (name: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, name] : prev.filter((item) => item !== name)));
  };

  const deleteSelected = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete_files', files: selected }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Delete failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else {
        setSuccess(t('Deleted'));
        window.location.reload();
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('My Files')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}
      <FileDropzone
        action={window.location.href}
        onComplete={() => window.location.reload()}
        onError={setError}
      />
      {files.length === 0 ? (
        <EmptyState message={t('No files')} />
      ) : (
        <Paper withBorder className="hydro-content-card">
          <ScrollArea>
            <Table striped highlightOnHover miw={640}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={44}>
                  <Checkbox
                    aria-label={t('Select All')}
                    checked={files.length > 0 && files.every((file: any) => selected.includes(file.name || file.filename || file._id))}
                    onChange={(e) => setSelected(e.currentTarget.checked ? files.map((file: any) => file.name || file.filename || file._id) : [])}
                  />
                </Table.Th>
                <Table.Th>{t('Filename')}</Table.Th>
                <Table.Th>{t('Size')}</Table.Th>
                <Table.Th>{t('Date')}</Table.Th>
                <Table.Th>{t('Action')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {files.map((f: any) => {
                const name = f.name || f.filename || f._id;
                return (
                <Table.Tr key={name}>
                  <Table.Td>
                    <Checkbox
                      aria-label={name}
                      checked={selected.includes(name)}
                      onChange={(e) => toggle(name, e.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text component="a" href={`/file/${uid}/${encodeURIComponent(name)}`} size="sm" className="hover:underline">
                      {name}
                    </Text>
                  </Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{formatSize(f.length || f.size || 0)}</Text></Table.Td>
                  <Table.Td><TimeDisplay date={f.lastModified || f.uploadDate || f._id} format="relative" /></Table.Td>
                  <Table.Td>
                    <Button component="a" href={`/file/${uid}/${encodeURIComponent(name)}`} size="xs" variant="light">
                      {t('Download')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );})}
            </Table.Tbody>
          </Table>
          </ScrollArea>
          <Group justify="flex-end" p="md">
            <Button color="red" variant="light" disabled={!selected.length} loading={loading} onClick={deleteSelected}>
              {t('Remove Selected')}
            </Button>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
