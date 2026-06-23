import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { FileDropzone } from '@/components/common/file-dropzone';
import { FilePreviewModal } from '@/components/common/file-preview-modal';
import { FormDialog } from '@/components/common/form-dialog';
import { Link } from '@/components/link';
import { STATUS } from '@/components/record/status-map';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';
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

interface RenameDialogProps {
  opened: boolean;
  onClose: () => void;
  files: string[];
  onRename: (files: string[], newNames: string[]) => Promise<void>;
}

function RenameDialog({ opened, onClose, files, onRename }: RenameDialogProps) {
  const { t } = useI18n();
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [saving, setSaving] = useState(false);

  const newNames = files.map((f) => {
    let result = f;
    if (find) {
      try {
        if (find.length > 2 && find.startsWith('/')) {
          let pattern = find.slice(1);
          const flags: string[] = [];
          while (['g', 'i'].includes(pattern[pattern.length - 1])) {
            flags.unshift(pattern[pattern.length - 1]);
            pattern = pattern.slice(0, -1);
          }
          if (pattern.endsWith('/')) pattern = pattern.slice(0, -1);
          result = result.replace(new RegExp(pattern, flags.join('')), replace);
        } else {
          result = result.replaceAll(find, replace);
        }
      } catch { /* ignore regex errors */ }
    }
    return prefix + result + suffix;
  });

  const hasChanges = !!(find || prefix || suffix);

  const handleOk = async () => {
    if (step === 'input') {
      if (!hasChanges) return;
      setStep('preview');
      return;
    }
    setSaving(true);
    try {
      await onRename(files, newNames);
      onClose();
      setStep('input');
      setFind('');
      setReplace('');
      setPrefix('');
      setSuffix('');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (step === 'preview') {
      setStep('input');
      return;
    }
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title={t('Rename Selected')} size="lg">
      {step === 'input' ? (
        <Stack gap="md">
          <Group grow align="flex-start">
            <Stack gap="xs">
              <Text size="sm" fw={700}>{t('Batch replacement')}</Text>
              <TextInput
                label={t('Original content')}
                placeholder={t('RegExp supported, quote with "/"')}
                value={find}
                onChange={(e) => setFind(e.currentTarget.value)}
                size="xs"
              />
              <TextInput
                label={t('Replace with')}
                value={replace}
                onChange={(e) => setReplace(e.currentTarget.value)}
                size="xs"
              />
            </Stack>
            <Stack gap="xs">
              <Text size="sm" fw={700}>{t('Add prefix/suffix')}</Text>
              <TextInput
                label={t('Add prefix')}
                value={prefix}
                onChange={(e) => setPrefix(e.currentTarget.value)}
                size="xs"
              />
              <TextInput
                label={t('Add suffix')}
                value={suffix}
                onChange={(e) => setSuffix(e.currentTarget.value)}
                size="xs"
              />
            </Stack>
          </Group>
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={handleClose}>{t('Cancel')}</Button>
            <Button size="xs" onClick={handleOk} disabled={!hasChanges}>{t('Next')}</Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <Text size="sm">{t('Are you sure to rename the following file?')}</Text>
          <div style={{ maxHeight: '40vh', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--hydro-border)' }}>{t('Original filename(s)')}</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--hydro-border)' }}>{t('New filename(s)')}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={f}>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--hydro-border)', fontFamily: 'monospace' }}>{f}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--hydro-border)', fontFamily: 'monospace' }}>{newNames[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={handleClose}>{t('Cancel')}</Button>
            <Button size="xs" onClick={handleOk} loading={saving}>{t('Confirm')}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
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
  const [previewFile, setPreviewFile] = useState<{ name: string, size: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<string[] | null>(null);
  const [renameSingleTarget, setRenameSingleTarget] = useState<string | null>(null);
  const [createOpened, setCreateOpened] = useState(false);
  const user = useSessionStore((s) => s.user);
  const isOwner = pdoc.owner === user?._id;
  const canDownload = type === 'additional_file' || isOwner || canEdit;
  const domainPrefix = window.location.pathname.match(/^(\/d\/[^/]+)/)?.[0] || '';
  const filesBaseUrl = `${domainPrefix}/p/${pid}/files`;

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
      const res = await fetch(filesBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation, type, ...body }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.error);
      setSelected(new Set());
      onComplete();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert(err.message);
    } finally {
      setOperating(false);
    }
  };

  const deleteSingle = async (name: string) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('Confirm to delete the file?'))) return;
    await postOperation('delete_files', { files: [name] });
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('Confirm to delete the selected files?'))) return;
    await postOperation('delete_files', { files: Array.from(selected) });
  };

  const renameSingle = async (name: string) => {
    setRenameSingleTarget(name);
  };

  const submitRenameSingle = async (name: string, value: string) => {
    const newName = value.trim();
    if (!newName || newName === name) return;
    await postOperation('rename_files', { files: [name], newNames: [newName] });
    setRenameSingleTarget(null);
  };

  const renameSelected = async (targetFiles: string[], newNames: string[]) => {
    await postOperation('rename_files', { files: targetFiles, newNames });
  };

  const downloadSelected = async () => {
    if (!selected.size) return;
    setOperating(true);
    try {
      const res = await fetch(filesBaseUrl, {
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

  const handleSaveFile = async (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('file', blob, filename);
    formData.append('type', type);
    formData.append('operation', 'upload_file');
    const res = await fetch(filesBaseUrl, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
    });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('json') ? await res.json() : {};
    if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Save failed')));
    onComplete();
  };

  const handleCreateFile = async () => {
    setCreateOpened(true);
  };

  const submitCreateFile = (value: string) => {
    const filename = value.trim();
    if (!filename) return;
    setCreateOpened(false);
    setPreviewFile({ name: filename, size: 0 });
  };

  const fileUrl = previewFile ? `${domainPrefix}/p/${pid}/file/${encodeURIComponent(previewFile.name)}?type=${type}` : '';

  return (
    <>
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

          {files.length > 0 ? (
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {canEdit && <th style={{ width: 40, padding: '6px 8px', borderBottom: '2px solid var(--hydro-border-strong)', background: 'var(--hydro-surface-tint)' }} />}
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid var(--hydro-border-strong)', background: 'var(--hydro-surface-tint)', color: 'var(--hydro-text-muted)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase' }}>{t('Filename')}</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '2px solid var(--hydro-border-strong)', background: 'var(--hydro-surface-tint)', color: 'var(--hydro-text-muted)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', width: 100 }}>{t('Size')}</th>
                    {canEdit && <th style={{ width: 80, padding: '6px 8px', borderBottom: '2px solid var(--hydro-border-strong)', background: 'var(--hydro-surface-tint)' }} />}
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.name} style={{ transition: 'background var(--hydro-duration-fast) var(--hydro-ease-out)' }} className="hover:bg-[var(--hydro-surface-muted)]">
                      {canEdit && (
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--hydro-border)' }}>
                          <Checkbox checked={selected.has(file.name)} onChange={() => toggleSelect(file.name)} size="xs" />
                        </td>
                      )}
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--hydro-border)' }}>
                        {canDownload ? (
                          <a
                            href={fileUrl}
                            onClick={(e) => { e.preventDefault(); setPreviewFile(file); }}
                            className="hydro-subtle-link"
                            style={{ fontWeight: 600, fontSize: 13 }}
                          >
                            {file.name}
                          </a>
                        ) : (
                          <Text size="sm" fw={600}>{file.name}</Text>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--hydro-border)' }}>
                        <Text size="xs" c="dimmed">{formatSize(file.size)}</Text>
                      </td>
                      {canEdit && (
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--hydro-border)' }}>
                          <Group gap={4} justify="flex-end">
                            <ActionIcon variant="subtle" size="sm" onClick={() => renameSingle(file.name)} title={t('Rename')}>
                              <Text size="xs">✏</Text>
                            </ActionIcon>
                            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => deleteSingle(file.name)} title={t('Delete')}>
                              <Text size="xs">✕</Text>
                            </ActionIcon>
                          </Group>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Text c="dimmed" size="sm">{t('No files')}</Text>
          )}

          {canEdit && !isReference && (
            <>
              <Group gap="xs">
                <Button variant="light" size="xs" onClick={handleCreateFile}>
                  {t('Create')}
                </Button>
              </Group>
              <FileDropzone
                action={filesBaseUrl}
                fields={{ type }}
                onComplete={onComplete}
              />
            </>
          )}

          {selected.size > 0 && (
            <>
              <Divider />
              <Group gap="xs">
                {canDownload && (
                  <Button variant="light" size="xs" onClick={downloadSelected} loading={operating}>
                    {t('Download Selected')} ({selected.size})
                  </Button>
                )}
                {canEdit && (
                  <>
                    <Button variant="light" color="red" size="xs" onClick={deleteSelected} loading={operating}>
                      {t('Remove Selected')} ({selected.size})
                    </Button>
                    <Button variant="light" size="xs" onClick={() => setRenameTarget(Array.from(selected))} loading={operating}>
                      {t('Rename Selected')} ({selected.size})
                    </Button>
                  </>
                )}
              </Group>
            </>
          )}
        </Stack>
      </Card>

      <FilePreviewModal
        opened={!!previewFile}
        onClose={() => setPreviewFile(null)}
        file={previewFile}
        fileUrl={fileUrl}
        canEdit={canEdit}
        onSave={handleSaveFile}
      />

      {renameTarget && (
        <RenameDialog
          opened={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          files={renameTarget}
          onRename={renameSelected}
        />
      )}

      <FormDialog
        opened={createOpened}
        title={t('Create File')}
        fields={[{
          name: 'filename',
          label: t('Filename'),
          required: true,
          placeholder: type === 'testdata' ? '1.in' : 'checker.cpp',
        }]}
        onClose={() => setCreateOpened(false)}
        onSubmit={(values) => submitCreateFile(String(values.filename || ''))}
        confirmLabel={t('Create')}
        cancelLabel={t('Cancel')}
      />

      <FormDialog
        opened={!!renameSingleTarget}
        title={t('Rename')}
        fields={[{
          name: 'filename',
          label: t('New Filename'),
          required: true,
          defaultValue: renameSingleTarget || '',
        }]}
        onClose={() => setRenameSingleTarget(null)}
        onSubmit={(values) => {
          if (!renameSingleTarget) return;
          return submitRenameSingle(renameSingleTarget, String(values.filename || ''));
        }}
        confirmLabel={t('Confirm')}
        cancelLabel={t('Cancel')}
        loading={operating}
      />
    </>
  );
}

function GenerateTestdata({
  pid,
  pdoc,
  testdata,
  onComplete,
}: {
  pid: string | number;
  pdoc: any;
  testdata: any[];
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const [gen, setGen] = useState('');
  const [std, setStd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [recordUrl, setRecordUrl] = useState('');
  const fileOptions = testdata.map((file) => ({ value: file.name, label: `${file.name} (${formatSize(file.size)})` }));
  const domainPrefix = window.location.pathname.match(/^(\/d\/[^/]+)/)?.[0] || '';
  const filesBaseUrl = `${domainPrefix}/p/${pid}/files`;

  useEffect(() => {
    if (!recordUrl) return undefined;
    const callback = (event: MessageEvent<any>) => {
      if (event.data?.status === STATUS.STATUS_ACCEPTED) {
        setRecordUrl('');
        onComplete();
      }
    };
    window.addEventListener('message', callback, false);
    return () => window.removeEventListener('message', callback, false);
  }, [onComplete, recordUrl]);

  if (pdoc.config?.type && pdoc.config.type !== 'default') return null;

  const handleGenerate = async () => {
    if (!gen) {
      setError(t('Please input the generator.'));
      return;
    }
    if (!std) {
      setError(t('Please input the standard program.'));
      return;
    }
    setError('');
    setGenerating(true);
    try {
      const res = await fetch(filesBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'generate_testdata', gen, std }),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Operation failed')));
      else setRecordUrl(data.url || data.redirect || '');
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
        <Select
          label={t('Data Generator')}
          placeholder={t('Select a testdata file')}
          data={fileOptions}
          searchable
          value={gen}
          onChange={(value) => setGen(value || '')}
          size="xs"
        />
        <Select
          label={t('Standard Program')}
          placeholder={t('Select a testdata file')}
          data={fileOptions}
          searchable
          value={std}
          onChange={(value) => setStd(value || '')}
          size="xs"
        />
        {error && <Text size="xs" c="red">{error}</Text>}
        <Button variant="light" size="xs" onClick={handleGenerate} loading={generating} disabled={!fileOptions.length}>
          {t('Generate')}
        </Button>
      </Stack>
      <Modal
        opened={!!recordUrl}
        onClose={() => {
          setRecordUrl('');
          onComplete();
        }}
        title={t('Generating...')}
        size="calc(100vw - 200px)"
      >
        {recordUrl && (
          <iframe
            src={recordUrl}
            title={t('Generate Testdata')}
            style={{ width: '100%', height: '70vh', border: 'none' }}
          />
        )}
      </Modal>
    </Card>
  );
}

export default function ProblemFilesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
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
          leftSection={<IconArrowLeft size={14} />}
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
                  <Button component={Link} to="problem_config" params={{ pid }} variant="filled" size="xs">
                    {t('Config')}
                  </Button>
                )
              }
            />
            {canEdit && (
              <GenerateTestdata
                pid={pid}
                pdoc={pdoc}
                testdata={testdata}
                onComplete={refresh}
              />
            )}
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
