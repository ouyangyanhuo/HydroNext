import yaml from 'js-yaml';
import { Badge, Button, Card, Checkbox, Group, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Switch, Tabs, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { CodeEditor } from '@/components/editor/code-editor';
import { FileDropzone } from '@/components/common/file-dropzone';
import { FilePreviewModal } from '@/components/common/file-preview-modal';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';
import { getLangDisplay, LANG_DISPLAY } from '@/utils/lang-display';

function toText(config: any) {
  if (!config) return '';
  if (typeof config === 'string') return config;
  return yaml.dump(config);
}

function parseConfig(text: string) {
  try {
    return (yaml.load(text) || {}) as Record<string, any>;
  } catch {
    return {};
  }
}

function formatSize(size?: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function dumpConfig(config: Record<string, any>) {
  const clean = Object.fromEntries(Object.entries(config).filter(([, value]) => {
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }));
  return yaml.dump(clean, { noArrayIndent: true });
}

function normalizeFileValue(value: any) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.file || '';
}

function normalizeLangValue(value: any) {
  if (!value || typeof value === 'string') return 'auto';
  return value.lang || 'auto';
}

function normalizeFileWithLang(file: string, lang: string) {
  if (!file) return null;
  return lang && lang !== 'auto' ? { file, lang } : file;
}

function getLanguageOptions() {
  const langs = (window as any).LANGS || {};
  const entries = Object.entries<any>(langs)
    .filter(([, value]) => !value?.hidden && !value?.disabled)
    .map(([key, value]) => ({ value: key, label: value?.display || getLangDisplay(key) }));
  if (entries.length) return entries;
  return Object.entries(LANG_DISPLAY).map(([value, label]) => ({ value, label }));
}

function fileOptions(testdata: any[]) {
  return testdata.map((file) => ({ value: file.name, label: file.name }));
}

function parseCasePairs(testdata: any[]) {
  const inputFiles = testdata.filter((file) => /\.(in|input|txt)$/i.test(file.name));
  return inputFiles.map((file) => {
    const base = file.name.replace(/\.(in|input|txt)$/i, '');
    const output = testdata.find((item) => item.name === `${base}.out` || item.name === `${base}.ans` || item.name === `${base}.output`);
    return { input: file.name, output: output?.name || '' };
  });
}

export default function ProblemConfigPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const testdata = args.testdata || [];
  const [config, setConfig] = useState(toText(args.config || pdoc.config || {}));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewFile, setPreviewFile] = useState<{ name: string; size: number } | null>(null);
  const pid = pdoc.pid || pdoc.docId;
  const parsed = useMemo(() => parseConfig(config), [config]);
  const files = useMemo(() => fileOptions(testdata), [testdata]);
  const languages = useMemo(() => getLanguageOptions(), []);
  const type = parsed.type || 'default';
  const checkerMode = ['strict', 'default', undefined, ''].includes(parsed.checker_type) ? 'default'
    : parsed.checker_type === 'testlib' ? 'testlib' : 'other';

  const updateConfig = (patch: Record<string, any>) => {
    setConfig(dumpConfig({ ...parsed, ...patch }));
  };

  const updateFileWithLang = (key: string, file: string | null, lang: string) => {
    updateConfig({ [key]: normalizeFileWithLang(file || '', lang) });
  };

  const addAutoSubtask = () => {
    const pairs = parseCasePairs(testdata);
    if (!pairs.length) return;
    updateConfig({
      subtasks: [{
        id: 1,
        type: 'sum',
        score: 100,
        cases: pairs.map((item) => ({
          input: item.input,
          output: item.output,
          time: parsed.time || '1000ms',
          memory: parsed.memory || '256MB',
        })),
      }],
    });
  };

  const addSubtask = () => {
    const subtasks = Array.isArray(parsed.subtasks) ? parsed.subtasks : [];
    const maxId = subtasks.reduce((max: number, subtask: any) => Math.max(max, Number(subtask.id) || 0), 0);
    updateConfig({
      subtasks: [...subtasks, { id: maxId + 1, type: 'sum', score: 0, cases: [] }],
    });
  };

  const updateSubtask = (index: number, patch: Record<string, any>) => {
    const subtasks = Array.isArray(parsed.subtasks) ? [...parsed.subtasks] : [];
    subtasks[index] = { ...(subtasks[index] || {}), ...patch };
    updateConfig({ subtasks });
  };

  const removeSubtask = (index: number) => {
    const subtasks = Array.isArray(parsed.subtasks) ? [...parsed.subtasks] : [];
    subtasks.splice(index, 1);
    updateConfig({ subtasks });
  };

  const addCase = (subtaskIndex: number) => {
    const subtasks = Array.isArray(parsed.subtasks) ? [...parsed.subtasks] : [];
    const subtask = { ...(subtasks[subtaskIndex] || {}) };
    subtask.cases = [...(subtask.cases || []), { input: '', output: '', time: parsed.time || '1000ms', memory: parsed.memory || '256MB' }];
    subtasks[subtaskIndex] = subtask;
    updateConfig({ subtasks });
  };

  const updateCase = (subtaskIndex: number, caseIndex: number, patch: Record<string, any>) => {
    const subtasks = Array.isArray(parsed.subtasks) ? [...parsed.subtasks] : [];
    const subtask = { ...(subtasks[subtaskIndex] || {}) };
    const cases = [...(subtask.cases || [])];
    cases[caseIndex] = { ...(cases[caseIndex] || {}), ...patch };
    subtask.cases = cases;
    subtasks[subtaskIndex] = subtask;
    updateConfig({ subtasks });
  };

  const removeCase = (subtaskIndex: number, caseIndex: number) => {
    const subtasks = Array.isArray(parsed.subtasks) ? [...parsed.subtasks] : [];
    const subtask = { ...(subtasks[subtaskIndex] || {}) };
    const cases = [...(subtask.cases || [])];
    cases.splice(caseIndex, 1);
    subtask.cases = cases;
    subtasks[subtaskIndex] = subtask;
    updateConfig({ subtasks });
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('operation', 'upload_file');
      form.append('filename', 'config.yaml');
      form.append('type', 'testdata');
      form.append('file', new Blob([config], { type: 'text/yaml' }), 'config.yaml');
      const res = await fetch(`/p/${pdoc.pid || pdoc.docId}/files`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: form,
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Save failed')));
      else {
        notifications.show({ title: t('Save successfully'), message: '', color: 'green' });
        navigate(window.location.href);
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFile = async (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('file', blob, filename);
    formData.append('type', 'testdata');
    formData.append('operation', 'upload_file');
    const res = await fetch(`/p/${pid}/files`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
    });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('json') ? await res.json() : {};
    if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Save failed')));
    navigate(window.location.href);
  };

  const fileUrl = previewFile ? `/p/${pid}/file/${encodeURIComponent(previewFile.name)}?type=testdata` : '';

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Judge Config')} - ${pdoc.pid}. ${pdoc.title}`}>
        <Button onClick={handleSave} loading={loading} size="xs">{t('Save')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Stack gap="lg" className="min-w-0 flex-1">
          <Card withBorder p="lg" className="hydro-content-card">
            <Group justify="space-between" mb="md">
              <Title order={3} size="h4">{t('Basic')}</Title>
              <Badge variant="light">config.yaml</Badge>
            </Group>
            <Tabs defaultValue="basic" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="basic">{t('Basic')}</Tabs.Tab>
                <Tabs.Tab value="checker">{t('Checker')}</Tabs.Tab>
                <Tabs.Tab value="files">{t('Extra Files')}</Tabs.Tab>
                <Tabs.Tab value="subtasks">{t('Subtasks')}</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="basic" pt="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <Select
                    label={t('Problem Type')}
                    value={type}
                    data={[
                      { value: 'default', label: t('problem_type.default') },
                      { value: 'interactive', label: t('problem_type.interactive') },
                      { value: 'communication', label: t('problem_type.communication') },
                      { value: 'submit_answer', label: t('problem_type.submit_answer') },
                      { value: 'objective', label: t('problem_type.objective') },
                    ]}
                    onChange={(value) => updateConfig({ type: value || 'default' })}
                  />
                  <TextInput
                    label={t('FileIO')}
                    rightSection={<Text size="xs">.in/.out</Text>}
                    rightSectionWidth={82}
                    value={parsed.filename || ''}
                    disabled={type !== 'default'}
                    onChange={(e) => updateConfig({ filename: e.currentTarget.value })}
                  />
                  <TextInput
                    label={t('Time Limit')}
                    value={String(parsed.time || '')}
                    placeholder="1000ms"
                    onChange={(e) => updateConfig({ time: e.currentTarget.value })}
                  />
                  <TextInput
                    label={t('Memory Limit')}
                    value={String(parsed.memory || '')}
                    placeholder="256MB"
                    onChange={(e) => updateConfig({ memory: e.currentTarget.value })}
                  />
                  <NumberInput
                    label={t('Max Passes')}
                    value={Number(parsed.multi_pass || 0)}
                    min={0}
                    max={20}
                    disabled={!['default', 'interactive'].includes(type)}
                    onChange={(value) => updateConfig({ multi_pass: Number(value) || undefined })}
                  />
                  {type === 'communication' && (
                    <NumberInput
                      label={t('Number of Processes')}
                      value={Number(parsed.num_processes || 2)}
                      min={2}
                      max={16}
                      onChange={(value) => updateConfig({ num_processes: Number(value) || 2 })}
                    />
                  )}
                  {type === 'submit_answer' && (
                    <>
                      <Switch
                        label={t('Multi-file')}
                        checked={parsed.subType === 'multi'}
                        onChange={(e) => updateConfig({ subType: e.currentTarget.checked ? 'multi' : 'single' })}
                      />
                      <TextInput
                        label={t('Filename')}
                        value={parsed.filename || '#.txt'}
                        disabled={parsed.subType !== 'multi'}
                        onChange={(e) => updateConfig({ filename: e.currentTarget.value })}
                      />
                    </>
                  )}
                  {!['submit_answer', 'objective'].includes(type) && (
                    <MultiSelect
                      label={t('Languages')}
                      placeholder={t('Unlimited')}
                      data={languages}
                      searchable
                      value={Array.isArray(parsed.langs) ? parsed.langs : []}
                      onChange={(value) => updateConfig({ langs: value })}
                      className="sm:col-span-2"
                    />
                  )}
                </SimpleGrid>
              </Tabs.Panel>

              <Tabs.Panel value="checker" pt="md">
                <Stack gap="md">
                  {['default', 'submit_answer'].includes(type) && (
                    <>
                      <Select
                        label={t('CheckerType')}
                        value={checkerMode}
                        data={[
                          { value: 'default', label: t('default') },
                          { value: 'testlib', label: 'testlib' },
                          { value: 'other', label: t('other') },
                        ]}
                        onChange={(value) => updateConfig({
                          checker_type: value === 'default' ? (parsed.checker_type === 'strict' ? 'strict' : 'default') : value,
                        })}
                      />
                      {checkerMode === 'default' && (
                        <Checkbox
                          label={t('Ignore trailing space and enter.')}
                          checked={(parsed.checker_type || 'default') !== 'strict'}
                          onChange={(e) => updateConfig({ checker_type: e.currentTarget.checked ? 'default' : 'strict' })}
                        />
                      )}
                      {checkerMode === 'testlib' && (
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                          <Select
                            label={t('Checker')}
                            data={[
                              { value: 'acmp', label: 'acmp' },
                              { value: 'testlib', label: 'testlib' },
                              ...files,
                            ]}
                            searchable
                            value={normalizeFileValue(parsed.checker)}
                            onChange={(value) => updateFileWithLang('checker', value, normalizeLangValue(parsed.checker))}
                          />
                          <Select
                            label={t('Language')}
                            data={[{ value: 'auto', label: 'auto' }, ...languages]}
                            searchable
                            value={normalizeLangValue(parsed.checker)}
                            onChange={(value) => updateFileWithLang('checker', normalizeFileValue(parsed.checker), value || 'auto')}
                          />
                        </SimpleGrid>
                      )}
                      {checkerMode === 'other' && (
                        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                          <Select
                            label={t('Interface')}
                            data={['syzoj', 'hustoj', 'qduoj', 'lemon', 'kattis']}
                            value={parsed.checker_type || 'syzoj'}
                            onChange={(value) => updateConfig({ checker_type: value || 'syzoj' })}
                          />
                          <Select
                            label={t('Checker')}
                            data={files}
                            searchable
                            value={normalizeFileValue(parsed.checker)}
                            onChange={(value) => updateFileWithLang('checker', value, normalizeLangValue(parsed.checker))}
                          />
                          <Select
                            label={t('Language')}
                            data={[{ value: 'auto', label: 'auto' }, ...languages]}
                            searchable
                            value={normalizeLangValue(parsed.checker)}
                            onChange={(value) => updateFileWithLang('checker', normalizeFileValue(parsed.checker), value || 'auto')}
                          />
                        </SimpleGrid>
                      )}
                    </>
                  )}
                  {type === 'interactive' && (
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                      <Select
                        label={t('Interactor')}
                        data={files}
                        searchable
                        value={normalizeFileValue(parsed.interactor)}
                        onChange={(value) => updateFileWithLang('interactor', value, normalizeLangValue(parsed.interactor))}
                      />
                      <Select
                        label={t('Language')}
                        data={[{ value: 'auto', label: 'auto' }, ...languages]}
                        searchable
                        value={normalizeLangValue(parsed.interactor)}
                        onChange={(value) => updateFileWithLang('interactor', normalizeFileValue(parsed.interactor), value || 'auto')}
                      />
                    </SimpleGrid>
                  )}
                  {type === 'communication' && (
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                      <Select
                        label={t('Manager')}
                        data={files}
                        searchable
                        value={normalizeFileValue(parsed.manager)}
                        onChange={(value) => updateFileWithLang('manager', value, normalizeLangValue(parsed.manager))}
                      />
                      <Select
                        label={t('Language')}
                        data={[{ value: 'auto', label: 'auto' }, ...languages]}
                        searchable
                        value={normalizeLangValue(parsed.manager)}
                        onChange={(value) => updateFileWithLang('manager', normalizeFileValue(parsed.manager), value || 'auto')}
                      />
                    </SimpleGrid>
                  )}
                  {type === 'objective' && <Text size="sm" c="dimmed">{t('Unsupported configure this type of problem. Please refer to the documentation.')}</Text>}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="files" pt="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <MultiSelect
                    label={t('user_extra_files')}
                    data={files}
                    searchable
                    value={Array.isArray(parsed.user_extra_files) ? parsed.user_extra_files : []}
                    onChange={(value) => updateConfig({ user_extra_files: value })}
                  />
                  <MultiSelect
                    label={t('judge_extra_files')}
                    data={files}
                    searchable
                    value={Array.isArray(parsed.judge_extra_files) ? parsed.judge_extra_files : []}
                    onChange={(value) => updateConfig({ judge_extra_files: value })}
                  />
                </SimpleGrid>
              </Tabs.Panel>

              <Tabs.Panel value="subtasks" pt="md">
                <Stack gap="md">
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={addAutoSubtask}>{t('Auto configure')}</Button>
                    <Button size="xs" variant="light" onClick={addSubtask}>{t('Add new subtask')}</Button>
                  </Group>
                  {(Array.isArray(parsed.subtasks) ? parsed.subtasks : []).map((subtask: any, subtaskIndex: number) => (
                    <Card key={subtask.id || subtaskIndex} withBorder p="md" className="bg-[var(--hydro-surface)]">
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Title order={4} size="h5">{t('Subtask {0}', subtask.id || subtaskIndex + 1)}</Title>
                          <Button size="compact-xs" variant="subtle" color="red" onClick={() => removeSubtask(subtaskIndex)}>
                            {t('Delete')}
                          </Button>
                        </Group>
                        <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
                          <NumberInput label="ID" value={Number(subtask.id || subtaskIndex + 1)} onChange={(value) => updateSubtask(subtaskIndex, { id: Number(value) || subtaskIndex + 1 })} />
                          <Select label={t('Type')} data={['sum', 'min', 'max']} value={subtask.type || 'sum'} onChange={(value) => updateSubtask(subtaskIndex, { type: value || 'sum' })} />
                          <NumberInput label={t('Score')} value={Number(subtask.score || 0)} onChange={(value) => updateSubtask(subtaskIndex, { score: Number(value) || 0 })} />
                          <TextInput label={t('Depend On')} value={(subtask.if || []).join(', ')} onChange={(e) => updateSubtask(subtaskIndex, { if: e.currentTarget.value.split(',').map((i) => i.trim()).filter(Boolean).map(Number) })} />
                        </SimpleGrid>
                        <Stack gap="xs">
                          {(subtask.cases || []).map((item: any, caseIndex: number) => (
                            <SimpleGrid key={caseIndex} cols={{ base: 1, sm: 5 }} spacing="xs">
                              <Select label={t('Input')} data={files} searchable value={item.input || null} onChange={(value) => updateCase(subtaskIndex, caseIndex, { input: value || '' })} />
                              <Select label={t('Output')} data={files} searchable value={item.output || null} onChange={(value) => updateCase(subtaskIndex, caseIndex, { output: value || '' })} />
                              <TextInput label={t('Time Limit')} value={String(item.time || '')} onChange={(e) => updateCase(subtaskIndex, caseIndex, { time: e.currentTarget.value })} />
                              <TextInput label={t('Memory Limit')} value={String(item.memory || '')} onChange={(e) => updateCase(subtaskIndex, caseIndex, { memory: e.currentTarget.value })} />
                              <Button mt={24} variant="subtle" color="red" onClick={() => removeCase(subtaskIndex, caseIndex)}>{t('Delete')}</Button>
                            </SimpleGrid>
                          ))}
                          <Button size="xs" variant="light" onClick={() => addCase(subtaskIndex)}>{t('Add Testcase')}</Button>
                        </Stack>
                      </Stack>
                    </Card>
                  ))}
                  {!(Array.isArray(parsed.subtasks) && parsed.subtasks.length) && (
                    <Text size="sm" c="dimmed">{t('No subtasks')}</Text>
                  )}
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Card>

          <Card withBorder p="lg" className="hydro-content-card">
            <Group justify="space-between" mb="md">
              <Title order={3} size="h4">{t('Config Editor')}</Title>
              <Text size="xs" c="dimmed">{t('YAML')}</Text>
            </Group>
            <CodeEditor value={config} onChange={setConfig} language="yaml" height={520} />
          </Card>
        </Stack>

        <Stack gap="lg" className="w-full shrink-0 lg:w-80">
          <Card withBorder p="lg" className="hydro-content-card">
            <Group justify="space-between" mb="md">
              <Title order={3} size="h4">{t('Testdata')}</Title>
              <Badge variant="light">{testdata.length} {t('files')}</Badge>
            </Group>
            {testdata.length ? (
              <Stack gap={0}>
                {testdata.map((file: any) => (
                  <Group key={file.name} justify="space-between" py="xs" px="sm" className="rounded-md hover:bg-[var(--hydro-surface)]">
                    <a
                      href={fileUrl}
                      onClick={(e) => { e.preventDefault(); setPreviewFile(file); }}
                      className="hydro-subtle-link min-w-0 truncate text-sm font-semibold"
                    >
                      {file.name}
                    </a>
                    <Text size="xs" c="dimmed" className="shrink-0">{formatSize(file.size)}</Text>
                  </Group>
                ))}
              </Stack>
            ) : <Text c="dimmed" size="sm">{t('No files')}</Text>}
            <FileDropzone
              action={`/p/${pid}/files`}
              fields={{ type: 'testdata' }}
              onComplete={() => navigate(window.location.href)}
            />
          </Card>
        </Stack>

        <FilePreviewModal
          opened={!!previewFile}
          onClose={() => setPreviewFile(null)}
          file={previewFile}
          fileUrl={fileUrl}
          canEdit
          onSave={handleSaveFile}
        />
      </div>
    </Stack>
  );
}
