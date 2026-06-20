import { Button, Card, Checkbox, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { FileDropzone } from '@/components/common/file-dropzone';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function formatSize(size?: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function TrainingFilesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const tdoc = args.tdoc || {};
  const tsdoc = args.tsdoc || {};
  const udoc = args.udoc || args.owner_udoc;
  const files = args.files || tdoc.files || [];
  const tid = tdoc.docId || tdoc._id;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleSelected = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const removeSelected = async () => {
    if (!selected.size) return;
    if (!window.confirm(t('Confirm to delete the selected files?'))) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete_files', files: Array.from(selected) }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Delete failed')));
      else window.location.reload();
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      key: 'select',
      title: '',
      width: 44,
      render: (file: any) => (
        <Checkbox
          checked={selected.has(file.name)}
          onChange={() => toggleSelected(file.name)}
          aria-label={file.name}
        />
      ),
    },
    {
      key: 'name',
      title: t('Filename'),
      render: (file: any) => (
        <a href={buildUrl('training_file_download', { tid, filename: file.name })} className="font-mono text-sm no-underline hover:underline">
          {file.name}
        </a>
      ),
    },
    {
      key: 'size',
      title: t('Size'),
      width: 120,
      align: 'right' as const,
      render: (file: any) => <Text size="xs" c="dimmed">{formatSize(file.size)}</Text>,
    },
  ];

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <Stack gap="lg">
          <PageHeader title={t('Files')}>
            <Group gap="xs">
              <Button size="xs" variant="light" disabled={!selected.size} loading={loading} onClick={removeSelected}>
                {t('Remove Selected')}
              </Button>
            </Group>
          </PageHeader>
          {error && <Text c="red" size="sm">{error}</Text>}
          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="md">{t('Upload File')}</Title>
            <FileDropzone
              action={window.location.href}
              onComplete={() => window.location.reload()}
              onError={setError}
            />
          </Card>
          <DataTable
            columns={columns}
            data={files.map((file: any) => ({ ...file, _id: file.name }))}
            emptyMessage={t('No files')}
          />
        </Stack>
      </div>

      <div className="w-full shrink-0 lg:w-72">
        <Stack gap="md">
          <Card withBorder p="md" className="hydro-panel">
            <Stack gap="xs">
              <Button component={Link} to="training_detail" params={{ tid }} fullWidth size="xs" variant="light">
                {t('View Training')}
              </Button>
              <Button component={Link} to="training_edit" params={{ tid }} fullWidth size="xs" variant="subtle">
                {t('Edit')}
              </Button>
              <Button component={Link} to="wiki_help" fullWidth size="xs" variant="subtle">
                {t('Help')}
              </Button>
            </Stack>
          </Card>

          <Card withBorder p="md" className="hydro-panel">
            <Title order={3} size="h5" mb="sm">{t('Information')}</Title>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" fw={700}>{t('Status')}</Text>
                <Text size="xs">{tsdoc.enroll ? t(tsdoc.done ? 'Completed' : 'In Progress') : t('Not Enrolled')}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed" fw={700}>{t('Enrollees')}</Text>
                <Text size="xs">{tdoc.attend || 0}</Text>
              </Group>
              <Group justify="space-between" align="flex-start">
                <Text size="xs" c="dimmed" fw={700}>{t('Created By')}</Text>
                {udoc ? <UserLink user={udoc} size="xs" /> : <Text size="xs">-</Text>}
              </Group>
            </Stack>
          </Card>
        </Stack>
      </div>
    </div>
  );
}
