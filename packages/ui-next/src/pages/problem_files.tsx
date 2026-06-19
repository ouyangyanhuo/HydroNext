import { ActionIcon, Badge, Button, Card, Checkbox, Divider, Group, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { FileDropzone } from '@/components/common/file-dropzone';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { useHasPriv, PRIV } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

function formatSize(size?: number) {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function totalSize(files: any[]) {
  return files.reduce((sum, file) => sum + (file.size || 0), 0);
}

function FileSection({
  title,
  files,
  type,
  pid,
  pdoc,
  canEdit,
  isReference,
  onComplete,
  extraHeader,
}: {
  title: string;
  files: any[];
  type: 'testdata' | 'additional_file';
  pid: string | number;
  pdoc: any;
  canEdit: boolean;
  isReference: boolean;
  onComplete: () => void;
  extraHeader?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [operating, setOperating] = useState(false);
  const user = useSessionStore((s) => s.user);
  const isOwner = pdoc.owner === user?._id;
  const canDownload = type === 'additional_file' || isOwner || canEdit;

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === files.length) setSelected(new Set());
    else setSelected(new Set(files.map((f) => f.name)));
  };

  const postOperation = async (operation: string, body: Record<string, any> = {}) => {
    setOperating(true);
    try {
      await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation, type, ...body }),
      });
      setSelected(new Set());
      onComplete();
    } finally {
      setOperating(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    if (!window.confirm(t('Confirm delete?'))) return;
    await postOperation('delete_files', { files: Array.from(selected) });
  };

  const downloadSelected = async () => {
    if (!selected.size) return;
    setOperating(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'get_links', files: Array.from(selected), type }),
      });
      const data = await res.json();
      if (data.links) {
        for (const [filename, url] of Object.entries<string>(data.links)) {
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
        }
      }
    } finally {
      setOperating(false);
    }
  };

  const columns = [
    ...(canEdit
      ? [{
          key: 'select',
          title: '',
          width: 40,
          render: (file: any) => (
            <Checkbox
              checked={selected.has(file.name)}
              onChange={() => toggleSelect(file.name)}
              size="xs"
            />
          ),
        }]
      : []),
    {
      key: 'name',
      title: t('Filename'),
      render: (file: any) =>
        canDownload ? (
          <Link
            href={`/p/${pid}/file/${encodeURIComponent(file.name)}?type=${type}`}
            className="hydro-subtle-link"
          >
            <Text size="sm" fw={600}>{file.name}</Text>
          </Link>
        ) : (
          <Text size="sm" fw={600}>{file.name}</Text>
        ),
    },
    {
      key: 'size',
      title: t('Size'),
      width: 100,
      align: 'right' as const,
      render: (file: any) => <Text size="xs" c="dimmed">{formatSize(file.size)}</Text>,
    },
    ...(canEdit
      ? [{
          key: 'operation',
          title: '',
          width: 40,
          render: (file: any) => (
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={async () => {
                if (!window.confirm(t('Confirm delete?'))) return;
                await postOperation('delete_files', { files: [file.name] });
              }}
            >
              <Text size="xs">✕</Text>
            </ActionIcon>
          ),
        }]
      : []),
  ];

  return (
    <Card withBorder p="lg" className="hydro-content-card">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md">
          <Title order={3} size="h4">{title}</Title>
          {extraHeader}
        </Group>

        <Group gap="xs">
          <Badge variant="light">{files.length} {t('files')}</Badge>
          <Badge variant="light" color="gray">{formatSize(totalSize(files))}</Badge>
        </Group>

        {canEdit && files.length > 0 && (
          <Checkbox
            checked={selected.size === files.length && files.length > 0}
            indeterminate={selected.size > 0 && selected.size < files.length}
            onChange={toggleSelectAll}
            label={t('Select All')}
            size="xs"
          />
        )}

        <DataTable
          columns={columns}
          data={files.map((file) => ({ ...file, _id: `${type}:${file.name}` }))}
          emptyMessage={t('No files')}
        />

        {canEdit && !isReference && (
          <FileDropzone
            action={`/p/${pid}/files`}
            fields={{ type }}
            onComplete={onComplete}
          />
        )}

        {selected.size > 0 && (
          <Group gap="xs">
            {canDownload && (
              <Button variant="light" size="xs" onClick={downloadSelected} loading={operating}>
                {t('Download')} ({selected.size})
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="light" color="red" size="xs" onClick={deleteSelected} loading={operating}>
                  {t('Delete')} ({selected.size})
                </Button>
                <Button variant="light" size="xs" onClick={async () => {
                  const newName = window.prompt(t('Rename to'));
                  if (!newName) return;
                  await postOperation('rename_files', { files: Array.from(selected), newNames: Array.from(selected).fill(newName) });
                }} loading={operating}>
                  {t('Rename')} ({selected.size})
                </Button>
              </>
            )}
          </Group>
        )}
      </Stack>
    </Card>
  );
}

function GenerateTestdata({ pid, pdoc }: { pid: string | number; pdoc: any }) {
  const { t } = useI18n();
  const [gen, setGen] = useState('');
  const [std, setStd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  if (pdoc.config?.type && pdoc.config.type !== 'default') return null;

  const handleGenerate = async () => {
    if (!gen) { setError(t('Please input the generator.')); return; }
    if (!std) { setError(t('Please input the standard program.')); return; }
    setError('');
    setGenerating(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'generate_testdata', gen, std }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else window.open(data.url, '_blank');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card withBorder p="lg" className="hydro-content-card">
      <Stack gap="md">
        <Title order={3} size="h4">{t('Generate Testdata')}</Title>
        <TextInput
          label={t('Data Generator')}
          placeholder={t('A data generator is a program that generates testdata.')}
          value={gen}
          onChange={(e) => setGen(e.currentTarget.value)}
          size="xs"
        />
        <TextInput
          label={t('Standard Program')}
          placeholder={t('A standard program is a program that solves the problem.')}
          value={std}
          onChange={(e) => setStd(e.currentTarget.value)}
          size="xs"
        />
        {error && <Text size="xs" c="red">{error}</Text>}
        <Button variant="light" size="xs" onClick={handleGenerate} loading={generating}>
          {t('Generate')}
        </Button>
      </Stack>
    </Card>
  );
}

export default function ProblemFilesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const pdoc = args.pdoc || {};
  const testdata = args.testdata || [];
  const additionalFiles = args.additional_file || [];
  const reference = args.reference;
  const pid = pdoc.pid || pdoc.docId;
  const lang = useSessionStore((s) => s.language);
  const title = extractLocalizedContent(pdoc.title, lang);
  const canEdit = !reference;
  const refresh = () => navigate(window.location.href);

  return (
    <Stack gap="lg">
      <Group gap="sm">
        <Button
          component={Link}
          to="problem_detail"
          params={{ pid }}
          variant="subtle"
          size="compact-sm"
          leftSection={<Text size="sm">←</Text>}
          className="text-[var(--hydro-text-muted)] hover:text-[var(--hydro-text)]"
        >
          {pid}. {title}
        </Button>
      </Group>

      <Card withBorder p="lg" className="hydro-content-card">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>
              <span className="text-[var(--hydro-primary)]">{pid}</span> {title}
            </Title>
            <Group gap="xs" mt="xs">
              {pdoc.tag?.map((tag: string) => (
                <Badge key={tag} size="xs" variant="light" color="gray">{tag}</Badge>
              ))}
            </Group>
          </div>
          <Group gap="xs">
            <Button component={Link} to="problem_edit" params={{ pid }} variant="light" size="xs">
              {t('Edit')}
            </Button>
            <Button component={Link} to="problem_config" params={{ pid }} variant="light" size="xs">
              {t('Judge Config')}
            </Button>
          </Group>
        </Group>
      </Card>

      {reference && (
        <Card withBorder p="md" className="hydro-content-card">
          <Group justify="space-between" gap="md">
            <div>
              <Text fw={700}>{t('This is a copy of another problem.')}</Text>
              <Text size="sm" c="dimmed">{reference.domainId}/{reference.pid}</Text>
            </div>
            <Button
              component={Link as any}
              href={`/d/${reference.domainId}/p/${reference.pid}`}
              variant="light"
              size="xs"
            >
              {t('Source')}
            </Button>
          </Group>
        </Card>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Stack gap="lg">
            <FileSection
              title={t('Testdata')}
              files={testdata}
              type="testdata"
              pid={pid}
              pdoc={pdoc}
              canEdit={canEdit}
              isReference={!!reference}
              onComplete={refresh}
              extraHeader={
                canEdit && (
                  <Group gap="xs">
                    <Button component={Link} to="problem_config" params={{ pid }} variant="filled" size="xs">
                      {t('Config')}
                    </Button>
                  </Group>
                )
              }
            />

            {canEdit && <GenerateTestdata pid={pid} pdoc={pdoc} />}
          </Stack>
        </div>

        <div className="min-w-0 flex-1">
          <FileSection
            title={t('Additional Files')}
            files={additionalFiles}
            type="additional_file"
            pid={pid}
            pdoc={pdoc}
            canEdit={canEdit}
            isReference={!!reference}
            onComplete={refresh}
          />
        </div>
      </div>
    </Stack>
  );
}
