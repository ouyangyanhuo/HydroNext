import { Group, NumberInput, Paper, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { TrainingPlanEditor, type TrainingProblemOption } from '@/components/training/training-plan-editor';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useDomainId } from '@/hooks/use-domain';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';
import { parseTrainingPlan, validateTrainingPlan } from '@/utils/training-plan';

const EMPTY_MARKDOWN = '<!-- empty -->';

function extractPids(dagText: string) {
  try {
    return [...new Set(parseTrainingPlan(dagText).flatMap((node) => node.pids.map(String)))];
  } catch {
    return [];
  }
}

function mergeOptions(...groups: TrainingProblemOption[][]) {
  const seen = new Set<string>();
  const result: TrainingProblemOption[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.value)) continue;
      seen.add(item.value);
      result.push(item);
    }
  }
  return result;
}

function problemOption(pdoc: any): TrainingProblemOption {
  return {
    value: String(pdoc.docId),
    label: `${pdoc.pid ? `${pdoc.pid} ` : ''}${pdoc.title || `ID ${pdoc.docId}`}`,
    description: `ID = ${pdoc.docId}`,
  };
}

export default function TrainingEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const domainId = useDomainId();
  const tdoc = args.tdoc || {};
  const isNew = !tdoc.docId;
  const initialDag = args.dag || JSON.stringify(tdoc.dag || [{ _id: 1, title: `${t('Section')} 1`, requireNids: [], pids: [] }], null, 2);
  const [form, setForm] = useState({
    title: tdoc.title || '',
    content: tdoc.content || '',
    description: tdoc.description || '',
    pin: Number(tdoc.pin || 0),
    dag: initialDag,
  });
  const [problemOptions, setProblemOptions] = useState<TrainingProblemOption[]>(() => (
    Object.values(args.pdict || {}).filter((pdoc: any) => pdoc?.docId !== undefined).map(problemOption)
  ));
  const [problemSearching, setProblemSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const problemSearchSeq = useRef(0);
  const problemSearchController = useRef<AbortController | null>(null);
  const selectedProblemIds = useMemo(() => extractPids(form.dag).sort(), [form.dag]);
  const problemIdsKey = selectedProblemIds.join(',');

  // Hydrate IDs introduced in the advanced JSON editor; backend-provided labels cover saved plans immediately.
  useEffect(() => {
    const ids = problemIdsKey.split(',').filter(Boolean).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!domainId || !ids.length) return undefined;
    const controller = new AbortController();
    fetch(`/d/${encodeURIComponent(domainId)}/api/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ args: { ids }, projection: ['docId', 'pid', 'title'] }),
      signal: controller.signal,
    }).then(async (res) => {
      const data = await res.json();
      if (controller.signal.aborted || !res.ok || !Array.isArray(data)) return;
      setProblemOptions((current) => mergeOptions(data.map(problemOption), current));
    }).catch(() => { /* Keep supplied labels if metadata is temporarily unavailable. */ });
    return () => controller.abort();
  }, [domainId, problemIdsKey]);

  useEffect(() => () => {
    problemSearchSeq.current++;
    problemSearchController.current?.abort();
  }, []);

  const searchProblems = async (query: string) => {
    if (!domainId) return;
    const seq = ++problemSearchSeq.current;
    problemSearchController.current?.abort();
    const controller = new AbortController();
    problemSearchController.current = controller;
    setProblemSearching(true);
    try {
      const res = await fetch(buildUrl('problem_main', { domainId }, { q: query, quick: 'true', sort: query ? 'default' : 'recent' }), {
        headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted || seq !== problemSearchSeq.current) return;
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Problem search failed')));
      const pdocs = Array.isArray(data.pdocs) ? data.pdocs : [];
      setProblemOptions((current) => mergeOptions(
        pdocs.map(problemOption),
        current,
      ));
    } catch {
      if (!controller.signal.aborted && seq === problemSearchSeq.current) {
        notifications.show({ title: t('Problem search failed'), message: '', color: 'red' });
      }
    } finally {
      if (seq === problemSearchSeq.current) setProblemSearching(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const plan = parseTrainingPlan(form.dag);
      validateTrainingPlan(plan);
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...form,
          dag: JSON.stringify(plan),
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
      const msg = err instanceof SyntaxError ? t('Invalid JSON') : t(err?.message || 'Network error');
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
            <TextInput
              className="sm:col-span-3"
              label={t('Title')}
              value={form.title}
              onChange={(e) => {
                const title = e.currentTarget.value;
                setForm((current) => ({ ...current, title }));
              }}
              required
            />
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
          <TrainingPlanEditor
            value={form.dag}
            onChange={(dag) => setForm((current) => ({ ...current, dag }))}
            options={problemOptions}
            searching={problemSearching}
            onSearch={searchProblems}
            disabled={loading}
          />
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-[var(--hydro-text-muted)]">{t('Advanced JSON plan')}</summary>
            <Textarea
              mt="md"
              label={t('Plan')}
              value={form.dag}
              onChange={(e) => setForm({ ...form, dag: e.currentTarget.value })}
              disabled={loading}
              minRows={12}
              autosize
              styles={{ input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '13px' } }}
            />
          </details>
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Save')}</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
