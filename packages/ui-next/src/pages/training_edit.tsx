import { Button, Group, MultiSelect, NumberInput, Paper, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useDomainId } from '@/hooks/use-domain';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

const DEFAULT_DAG = JSON.stringify([
  {
    _id: 1,
    title: '基础训练',
    requireNids: [],
    pids: [],
  },
], null, 2);
const EMPTY_MARKDOWN = '<!-- empty -->';

interface ProblemOption {
  value: string;
  label: string;
  description?: string;
}

function normalizeProblemId(id: string) {
  return Number.isSafeInteger(+id) ? +id : id;
}

function extractPids(dagText: string) {
  try {
    const dag = JSON.parse(dagText);
    if (!Array.isArray(dag)) return [];
    return dag.flatMap((node) => Array.isArray(node?.pids) ? node.pids.map((pid: any) => String(pid)) : []);
  } catch {
    return [];
  }
}

function mergeOptions(...groups: ProblemOption[][]) {
  const seen = new Set<string>();
  const result: ProblemOption[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.value)) continue;
      seen.add(item.value);
      result.push(item);
    }
  }
  return result;
}

function buildDagFromProblems(title: string, pids: string[]) {
  return JSON.stringify([{
    _id: 1,
    title: title || '基础训练',
    requireNids: [],
    pids: pids.map(normalizeProblemId),
  }], null, 2);
}

export default function TrainingEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const domainId = useDomainId();
  const tdoc = args.tdoc || {};
  const isNew = !tdoc.docId;
  const initialDag = args.dag || (tdoc.dag ? JSON.stringify(tdoc.dag, null, 2) : DEFAULT_DAG);
  const [form, setForm] = useState({
    title: tdoc.title || '',
    content: tdoc.content || '',
    description: tdoc.description || '',
    pin: Number(tdoc.pin || 0),
    dag: initialDag,
  });
  const [selectedProblems, setSelectedProblems] = useState<string[]>(() => extractPids(initialDag));
  const [problemOptions, setProblemOptions] = useState<ProblemOption[]>(() => extractPids(initialDag).map((pid) => ({ value: pid, label: `ID ${pid}` })));
  const [problemSearching, setProblemSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const problemSearchSeq = useRef(0);

  const problemData = useMemo(
    () => mergeOptions(selectedProblems.map((pid) => ({
      value: pid,
      label: problemOptions.find((item) => item.value === pid)?.label || `ID ${pid}`,
    })), problemOptions),
    [problemOptions, selectedProblems],
  );

  const searchProblems = async (query: string) => {
    if (!domainId) return;
    const seq = ++problemSearchSeq.current;
    setProblemSearching(true);
    try {
      const res = await fetch(buildUrl('problem_main', { domainId }, { q: query, quick: 'true', sort: query ? 'default' : 'recent' }), { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (seq !== problemSearchSeq.current) return;
      const pdocs = Array.isArray(data.pdocs) ? data.pdocs : [];
      setProblemOptions((current) => mergeOptions(
        pdocs.map((pdoc: any) => ({
          value: String(pdoc.docId),
          label: `${pdoc.pid ? `${pdoc.pid} ` : ''}${pdoc.title || `ID ${pdoc.docId}`}`,
          description: `ID = ${pdoc.docId}`,
        })),
        current,
      ));
    } catch {
      notifications.show({ title: t('Problem search failed'), message: '', color: 'red' });
    } finally {
      if (seq === problemSearchSeq.current) setProblemSearching(false);
    }
  };

  const updateSelectedProblems = (value: string[]) => {
    setSelectedProblems(value);
    setForm((current) => ({ ...current, dag: buildDagFromProblems(current.title, value) }));
  };

  const updateTitle = (title: string) => {
    setForm((current) => ({
      ...current,
      title,
      dag: selectedProblems.length ? buildDagFromProblems(title, selectedProblems) : current.dag,
    }));
  };

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const parsedDag = JSON.parse(form.dag);
      const pids = Array.isArray(parsedDag)
        ? parsedDag.flatMap((node: any) => Array.isArray(node?.pids) ? node.pids : [])
        : [];
      if (!pids.length) throw new Error(t('Please select at least one problem to perform this operation.'));
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...form,
          content: form.content.trim() || EMPTY_MARKDOWN,
          description: form.description.trim() || EMPTY_MARKDOWN,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = formatErrorMessage(data.error, t('Failed'));
        setError(msg);
        notifications.show({ title: msg, message: '', color: 'red' });
      } else {
        notifications.show({ title: isNew ? t('Created successfully') : t('Saved'), message: '', color: 'green' });
        if (data.redirect) navigate(data.redirect);
        else if (data.tid) navigate(buildUrl('training_detail', { tid: data.tid }));
        else navigate(isNew ? buildUrl('training_main') : buildUrl('training_detail', { tid: tdoc.docId }));
      }
    } catch (err: any) {
      const msg = err instanceof SyntaxError ? t('Invalid JSON') : (err?.message || t('Network error'));
      setError(msg);
      notifications.show({ title: msg, message: '', color: 'red' });
    } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={isNew ? t('Create Training') : t('Edit Training')}>
        <Button component="a" href={buildUrl('training_main')} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      <Paper withBorder p="lg">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md">
            <TextInput className="sm:col-span-3" label={t('Title')} value={form.title} onChange={(e) => updateTitle(e.currentTarget.value)} required />
            <NumberInput label={t('Pin')} value={form.pin} min={0} onChange={(value) => setForm({ ...form, pin: Number(value) || 0 })} />
          </SimpleGrid>
          <Textarea
            label={t('Introduce')}
            description={t('Introduce must not exceed 500 characters and it will be shown in the list view.')}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.currentTarget.value })}
            minRows={3}
            autosize
          />
          <div>
            <Text size="sm" fw={500} mb={6}>{t('Description')}</Text>
            <MarkdownEditor
              value={form.description}
              onChange={(description) => setForm({ ...form, description })}
              minRows={8}
            />
          </div>
          <MultiSelect
            label={t('Problems')}
            description={t('Select problems to generate a basic training plan. You can still edit the JSON plan below.')}
            data={problemData}
            value={selectedProblems}
            searchable
            clearable
            hidePickedOptions
            nothingFoundMessage={t('No results')}
            rightSection={problemSearching ? <Text size="xs" c="dimmed">...</Text> : null}
            onSearchChange={searchProblems}
            onChange={updateSelectedProblems}
            renderOption={({ option }) => {
              const item = option as ProblemOption;
              return (
                <div className="min-w-0">
                  <Text size="sm" fw={600} truncate>{item.label}</Text>
                  {item.description && <Text size="xs" c="dimmed" truncate>{item.description}</Text>}
                </div>
              );
            }}
          />
          <Textarea
            label={t('Plan')}
            value={form.dag}
            onChange={(e) => {
              const dag = e.currentTarget.value;
              setForm({ ...form, dag });
              setSelectedProblems(extractPids(dag));
            }}
            minRows={16}
            autosize
            styles={{ input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '13px' } }}
          />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Save')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
