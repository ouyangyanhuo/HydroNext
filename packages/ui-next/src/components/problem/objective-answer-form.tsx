import './objective.css';

import { Alert, Badge, Group, Stack, Text } from '@mantine/core';
import { dump } from 'js-yaml';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { MarkdownRenderer, type MarkdownRendererProps } from '@/components/markdown/markdown-renderer';
import { attachObjectiveInputs, type ObjectiveQuestion } from '@/components/markdown/objective-inputs';
import { usePageData, useUiContext, useUserContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { protectedSubmissionHeaders } from '@/registry/request-security';
import { hasObjectiveAnswer, type ObjectiveAnswers, objectiveDraftKey, readObjectiveDraft } from '@/utils/objective-answers';
import { getSubmissionRecordQuery } from '@/utils/problem-navigation';
import { formatRequestError } from '@/utils/request';

interface ObjectiveContextValue {
  answers: ObjectiveAnswers;
  disabled: boolean;
  setAnswer: (id: string, value: string | string[]) => void;
  register: (section: string, questions: ObjectiveQuestion[]) => void;
}
const ObjectiveContext = createContext<ObjectiveContextValue | null>(null);

export function ObjectiveMarkdown(props: MarkdownRendererProps) {
  const context = useContext(ObjectiveContext)!;
  const prefix = useId();
  const inputs = useRef<ReturnType<typeof attachObjectiveInputs> | null>(null);
  const latest = useRef(context);
  useLayoutEffect(() => { latest.current = context; }, [context]);
  const { register, setAnswer } = context;
  const enhance = useCallback((root: HTMLDivElement) => {
    const mounted = attachObjectiveInputs(root, { prefix, onChange: setAnswer });
    inputs.current = mounted;
    mounted.update(latest.current.answers, latest.current.disabled);
    register(prefix, mounted.questions);
    return () => {
      mounted.destroy();
      inputs.current = null;
      register(prefix, []);
    };
  }, [prefix, register, setAnswer]);
  useEffect(() => {
    inputs.current?.update(context.answers, context.disabled);
  }, [context.answers, context.disabled]);
  return <MarkdownRenderer {...props} enhance={enhance} />;
}

interface ObjectiveAnswerFormProps {
  children: ReactNode;
  pid: string | number;
  tid?: string;
  submitUrl: string;
  disabled: boolean;
  disabledReason: string;
}

export function ObjectiveAnswerForm({ children, pid, tid, submitUrl, disabled, disabledReason }: ObjectiveAnswerFormProps) {
  const { args } = usePageData();
  const ui = useUiContext();
  const user = useUserContext();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const key = objectiveDraftKey(user._id || 0, ui.domainId || '', pid, tid);
  const [answers, setAnswers] = useState<ObjectiveAnswers>(() => {
    try { return readObjectiveDraft(window.localStorage, key); } catch {
      return {};
    }
  });
  const answersRef = useRef(answers);
  const [sections, setSections] = useState<Record<string, ObjectiveQuestion[]>>({});
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(true);
  const [clearOpened, setClearOpened] = useState(false);

  const register = useCallback((section: string, questions: ObjectiveQuestion[]) => {
    setSections((previous) => {
      const next = { ...previous };
      if (questions.length) next[section] = questions;
      else delete next[section];
      return next;
    });
  }, []);
  const save = useCallback((next: ObjectiveAnswers) => {
    try {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, answers: next }));
      setSaved(true);
    } catch { setSaved(false); }
  }, [key]);
  const setAnswer = useCallback((id: string, value: string | string[]) => {
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    setAnswers(next);
    save(next);
  }, [save]);

  const questions = [...new Map(Object.values(sections).flat().map((question) => [question.id, question])).values()];
  const answered = questions.filter(({ id }) => hasObjectiveAnswer(answers[id])).length;
  const value = useMemo(() => ({ answers, disabled: disabled || loading, setAnswer, register }), [answers, disabled, loading, setAnswer, register]);

  const handleSubmit = async () => {
    if (disabled || pending.current || !questions.length) return;
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      const code = dump(answers, { lineWidth: -1, noRefs: true });
      const payload = { pid: Number(pid), lang: '_', code, pretest: false, input: [], fileHash: '' };
      const proof = await protectedSubmissionHeaders(Boolean(args.tdoc?.proctorEnabled), submitUrl, payload);
      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...proof },
        body: JSON.stringify({ lang: '_', code }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(formatRequestError(data.error, 'Submission failed'));
      if (data.rid) navigate(buildUrl('record_detail', { rid: data.rid }, getSubmissionRecordQuery(window.location.search, args.tdoc)));
      else if (data.redirect || data.url) navigate(data.redirect || data.url);
      else if (data.tid) navigate(buildUrl(args.tdoc?.rule === 'homework' ? 'homework_detail' : 'contest_problemlist', { tid: data.tid }));
      else throw new Error('Submission failed');
    } catch (err: any) {
      setError(t(err?.message || 'Network error'));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  return (
    <ObjectiveContext.Provider value={value}>
      <form id="objective-answers" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
        <Stack gap="lg">
          {children}
          <div className="hydro-objective-toolbar">
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" fw={600}>{t('Answered')}: {answered}/{questions.length}</Text>
                <Badge variant="light" color={saved ? 'green' : 'orange'}>{t(saved ? 'Saved' : 'Save failed')}</Badge>
              </Group>
              {questions.length > 0 && (
                <nav aria-label={t('problem_type.objective')} className="hydro-objective-navigation">
                  {questions.map(({ id, anchor }) => (
                    <Button
                      key={id}
                      type="button"
                      size="compact-sm"
                      variant={hasObjectiveAnswer(answers[id]) ? 'filled' : 'default'}
                      aria-label={`#${id}`}
                      onClick={() => {
                        const slot = document.getElementById(anchor);
                        slot?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        const input = slot?.querySelector<HTMLElement>('input, textarea, select')
                          || slot?.closest('p')?.nextElementSibling?.querySelector<HTMLElement>('input');
                        (input || slot)?.focus({ preventScroll: true });
                      }}
                    >{id}</Button>
                  ))}
                </nav>
              )}
              {error && <Alert color="red" role="alert">{error}</Alert>}
              <Group justify="space-between">
                <Button type="button" variant="subtle" color="red" disabled={disabled || loading} onClick={() => setClearOpened(true)}>
                  {t('Clear answers')}
                </Button>
                <Button type="submit" loading={loading} disabled={disabled || !questions.length}>
                  {disabled ? disabledReason : t('Submit')}
                </Button>
              </Group>
            </Stack>
          </div>
        </Stack>
      </form>
      <ConfirmDialog
        opened={clearOpened}
        onClose={() => setClearOpened(false)}
        title={t('Clear answers')}
        message={t('All changes will be lost. Are you sure to clear all answers?')}
        onConfirm={() => {
          answersRef.current = {};
          setAnswers({});
          save({});
          setClearOpened(false);
        }}
      />
    </ObjectiveContext.Provider>
  );
}
