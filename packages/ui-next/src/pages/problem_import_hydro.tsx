import { ActionIcon, Button, Card, Checkbox, Group, Paper, Progress, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconArrowLeft, IconCheck, IconFileZip, IconUpload, IconX } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData, useUserContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { hasPermValue, PERM, useHasPerm } from '@/hooks/use-permission';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { formatErrorMessage } from '@/utils/error';

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function ProblemImportHydroPage() {
  const { args } = usePageData();
  const user = useUserContext();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const isLoggedIn = useIsLoggedIn();
  const storeCanCreate = useHasPerm(PERM.PERM_CREATE_PROBLEM);
  const canCreate = Boolean(args.canCreateProblem ?? (
    hasPermValue(user.perm, PERM.PERM_CREATE_PROBLEM) || storeCanCreate
  ));
  const [file, setFile] = useState<File | null>(null);
  const [preferredPrefix, setPreferredPrefix] = useState('');
  const [hidden, setHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isLoggedIn || !canCreate) {
    return (
      <Stack gap="lg">
        <PageHeader title={t('Import From Hydro')} />
        <Card withBorder p="lg" className="hydro-content-card">
          <Text c="dimmed">{t('You do not have permission to import problems.')}</Text>
        </Card>
      </Stack>
    );
  }

  const selectFile = (nextFile?: File) => {
    setDragging(false);
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith('.zip')) {
      setFile(null);
      setError(t('Select a zip file'));
      return;
    }
    setFile(nextFile);
    setError('');
  };

  const handleSubmit = async () => {
    if (!file) {
      setError(t('Please select a file'));
      return;
    }
    setLoading(true);
    setProgress(0);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (preferredPrefix) formData.append('preferredPrefix', preferredPrefix);
      if (hidden) formData.append('hidden', 'on');
      const response = await new Promise<{ contentType: string, payload: any }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let lastProgress = -1;
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const nextProgress = Math.round((event.loaded / event.total) * 100);
          if (nextProgress !== lastProgress) {
            lastProgress = nextProgress;
            setProgress(nextProgress);
          }
        };
        xhr.onload = () => {
          const contentType = xhr.getResponseHeader('content-type') || '';
          let payload: any = {};
          if (contentType.includes('json') && xhr.responseText) {
            try {
              payload = JSON.parse(xhr.responseText);
            } catch (parseError) {
              reject(parseError);
              return;
            }
          }
          if (xhr.status < 200 || xhr.status >= 400) {
            reject(new Error(formatErrorMessage(payload.error, t('Import failed'))));
            return;
          }
          resolve({ contentType, payload });
        };
        xhr.onerror = () => reject(new Error(t('Network error')));
        xhr.open('POST', window.location.href);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.send(formData);
      });
      setProgress(100);
      if (response.contentType.includes('json')) {
        const data = response.payload;
        if (data.error) {
          setError(formatErrorMessage(data.error, t('Import failed')));
        } else if (data.redirect) {
          navigate(data.redirect);
        } else {
          navigate(buildUrl('problem_main'));
        }
      } else {
        navigate(buildUrl('problem_main'));
      }
    } catch (uploadError: any) {
      setError(uploadError?.message || t('Network error'));
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Import From Hydro')}>
        <Button
          component="a"
          href={buildUrl('problem_import')}
          variant="subtle"
          size="xs"
          leftSection={<IconArrowLeft size={14} />}
        >
          {t('Back')}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card withBorder p="lg" className="hydro-content-card min-w-0 flex-1">
          <Stack gap="md">
            <Title order={4}>{t('Upload zipfile')}</Title>
            <Text size="sm" c="dimmed">
              {t('With this feature, you can import problems that you can view from a site to here. Their title, content, tags and categories will be imported.')}
            </Text>

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              hidden
              onChange={(event) => {
                selectFile(event.currentTarget.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
            <Paper
              withBorder
              p="xl"
              role={file ? undefined : 'button'}
              tabIndex={file || loading ? -1 : 0}
              aria-label={t('Select a zip file')}
              aria-disabled={loading}
              onClick={() => { if (!file && !loading) fileInputRef.current?.click(); }}
              onKeyDown={(event) => {
                if (!file && !loading && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!loading) setDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!loading) {
                  event.dataTransfer.dropEffect = 'copy';
                  setDragging(true);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!loading) selectFile(event.dataTransfer.files[0]);
              }}
              style={{
                borderStyle: 'dashed',
                borderWidth: 2,
                borderColor: dragging || file ? 'var(--hydro-primary)' : 'var(--hydro-border)',
                background: dragging
                  ? 'color-mix(in srgb, var(--hydro-primary) 10%, var(--hydro-surface-raised))'
                  : 'var(--hydro-surface)',
                cursor: loading ? 'not-allowed' : file ? 'default' : 'pointer',
                opacity: loading ? 0.72 : 1,
                transform: dragging ? 'translateY(-2px)' : undefined,
                transition: 'border-color 160ms ease, background-color 160ms ease, transform 160ms ease',
              }}
            >
              {file ? (
                <Group wrap="nowrap" gap="md">
                  <ThemeIcon size={48} radius="xl" variant="light" color="hydroTeal">
                    <IconFileZip size={25} />
                  </ThemeIcon>
                  <div className="min-w-0 flex-1">
                    <Group gap={6} wrap="nowrap">
                      <IconCheck size={16} className="shrink-0 text-[var(--hydro-primary)]" />
                      <Text fw={700} truncate>{file.name}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">{formatFileSize(file.size)}</Text>
                    <Text size="xs" c="dimmed" mt={2}>{t('Drag files here or click to upload')}</Text>
                  </div>
                  <Group gap={4} wrap="nowrap">
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      disabled={loading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('Select a zip file')}
                    </Button>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t('Remove')}
                      disabled={loading}
                      onClick={() => {
                        setFile(null);
                        setError('');
                      }}
                    >
                      <IconX size={18} />
                    </ActionIcon>
                  </Group>
                </Group>
              ) : (
                <Stack align="center" gap="xs" py="md">
                  <ThemeIcon size={56} radius="xl" variant="light" color={dragging ? 'hydroTeal' : 'gray'}>
                    <IconUpload size={28} />
                  </ThemeIcon>
                  <Text fw={700}>{t('Drag files here or click to upload')}</Text>
                  <Text size="sm" c="dimmed">{t('Select a zip file')}</Text>
                </Stack>
              )}
            </Paper>

            <TextInput
              label={t('Preferred Prefix')}
              placeholder={t('Leave empty for default')}
              value={preferredPrefix}
              onChange={(e) => setPreferredPrefix(e.currentTarget.value)}
              description={t('The preferred problem ID prefix.')}
            />

            <Checkbox
              label={t('Hidden')}
              description={t('Make the problem hidden.')}
              checked={hidden}
              onChange={(e) => setHidden(e.currentTarget.checked)}
            />

            {error && <Text c="red" size="sm">{error}</Text>}

            {loading && (
              <Stack gap={6}>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">{t('Uploading...')}</Text>
                  <Text size="xs" fw={700}>{progress}%</Text>
                </Group>
                <Progress value={progress} animated={progress < 100} />
              </Stack>
            )}

            <Group justify="flex-end">
              <Button onClick={handleSubmit} loading={loading} disabled={!file}>
                {t('Upload')}
              </Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="lg" className="hydro-content-card w-full shrink-0 lg:w-80">
          <Stack gap="md">
            <Title order={4}>{t('What is this?')}</Title>
            <Text size="sm" c="dimmed">
              {t('With this feature, you can import problems that you can view from a site to here. Their title, content, tags and categories will be imported.')}
            </Text>
            <Title order={5}>{t('About preferredPrefix option')}</Title>
            <Text size="sm" c="dimmed">
              {t('preferredPrefix_hint')}
            </Text>
          </Stack>
        </Card>
      </div>
    </Stack>
  );
}
