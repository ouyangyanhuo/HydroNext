import './objective.css';

import { Alert, Badge, Group, Stack, Text } from '@mantine/core';
import { dump, load } from 'js-yaml';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { MarkdownRenderer, type MarkdownRendererProps } from '@/components/markdown/markdown-renderer';
import { attachObjectiveInputs, type ObjectiveQuestion } from '@/components/markdown/objective-inputs';
import { STATUS } from '@/components/record/status-map';
import { SubmissionResultModal } from '@/components/record/submission-result-modal';
import { usePageData, useUiContext, useUserContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { useRecordSocket } from '@/hooks/use-record-socket';
import { protectedAccessHeaders, protectedSubmissionHeaders } from '@/registry/request-security';
import {
  hasObjectiveAnswer, normalizeObjectiveAnswers, type ObjectiveAnswers, objectiveDraftKey, readObjectiveDraft,
} from '@/utils/objective-answers';
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
    const restore = () => mounted.update(latest.current.answers, latest.current.disabled);
    restore();
    // pageshow follows the browser's native form restoration, including back/forward cache restores.
    window.addEventListener('pageshow', restore);
    register(prefix, mounted.questions);
    return () => {
      window.removeEventListener('pageshow', restore);
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
  sidebarTarget?: HTMLElement | null;
}

export function ObjectiveAnswerForm({ children, pid, tid, submitUrl, disabled, disabledReason, sidebarTarget }: ObjectiveAnswerFormProps) {
  const { args } = usePageData();
  const ui = useUiContext();
  const user = useUserContext();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const key = objectiveDraftKey(user._id || 0, ui.domainId || '', pid, tid);
  const once = !!tid && !!args.objectiveSubmission?.once;
  const [submitted, setSubmitted] = useState(false);
  const locked = once && (submitted || !!args.objectiveSubmission?.submitted);
  const [answers, setAnswers] = useState<ObjectiveAnswers>(() => {
    if (once && args.objectiveSubmission?.submitted) {
      try {
        return normalizeObjectiveAnswers(load(args.objectiveSubmission.answers || ''));
      } catch { return {}; }
    }
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
  const [confirmOpened, setConfirmOpened] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [resultOpened, setResultOpened] = useState(false);
  const update = useRecordSocket(submitResult?.rid ? String(submitResult.rid) : undefined);
  const displayedResult = submitResult ? { ...submitResult, ...update } : null;

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
  const unanswered = questions.filter(({ id }) => !hasObjectiveAnswer(answers[id])).map(({ id }) => id);
  const value = useMemo(() => ({ answers, disabled: disabled || loading || locked, setAnswer, register }),
    [answers, disabled, loading, locked, setAnswer, register]);

  const recoverSubmission = async () => {
    if (!once) return;
    try {
      const headers = await protectedAccessHeaders(window.location.href);
      const response = await fetch(window.location.href, { headers: { ...headers, Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      if (!data.objectiveSubmission?.submitted) return;
      const restored = normalizeObjectiveAnswers(load(data.objectiveSubmission.answers || ''));
      answersRef.current = restored;
      setAnswers(restored);
      setSubmitted(true);
      setError('');
    } catch { /* Preserve the draft and allow another status check after connectivity returns. */ }
  };

  const handleSubmit = async () => {
    if (disabled || locked || pending.current || !questions.length) return;
    pending.current = true;
    setLoading(true);
    setError('');
    setSubmitResult(null);
    setResultOpened(false);
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
      if (once && (data.rid || data.tid || data.redirect || data.url)) setSubmitted(true);
      if (data.rid) {
        setSubmitResult({ status: STATUS.STATUS_WAITING, ...data });
        setResultOpened(true);
      } else if (data.redirect || data.url) navigate(data.redirect || data.url);
      else if (data.tid) navigate(buildUrl(args.tdoc?.rule === 'homework' ? 'homework_detail' : 'contest_problemlist', { tid: data.tid }));
      else throw new Error('Submission failed');
    } catch (err: any) {
      setError(t(err?.message || 'Network error'));
      await recoverSubmission();
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  const controls = (
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
              title={id}
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
      {once && <Text size="sm" c="dimmed">{t(locked
        ? 'Already submitted. This answer sheet cannot be changed or submitted again.'
        : 'This answer sheet can only be submitted once in this contest.')}</Text>}
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Button type="button" variant="subtle" color="red" disabled={disabled || loading || locked} onClick={() => setClearOpened(true)}>
          {t('Clear answers')}
        </Button>
        <Button type="submit" form="objective-answers" loading={loading} disabled={disabled || locked || !questions.length}>
          {locked ? t('Submitted') : disabled ? disabledReason : t('Submit')}
        </Button>
      </Group>
    </Stack>
  );

  return (
    <ObjectiveContext.Provider value={value}>
      <form
        id="objective-answers"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || locked || pending.current || !questions.length) return;
          if (once) setConfirmOpened(true);
          else void handleSubmit();
        }}>
        <Stack gap="lg">
          {children}
          {!sidebarTarget && <div className="hydro-objective-toolbar">{controls}</div>}
        </Stack>
      </form>
      {sidebarTarget && createPortal(controls, sidebarTarget)}
      <ConfirmDialog
        opened={confirmOpened}
        onClose={() => setConfirmOpened(false)}
        title={t('Confirm submission')}
        message={<>
          {unanswered.length > 0 && <>{t('Unanswered questions')}: {unanswered.join(', ')}. {t('Unanswered questions receive zero points.')}<br /></>}
          {t('This answer sheet can only be submitted once in this contest.')}{' '}
          {t('After submission, answers cannot be changed or completed. Submit now?')}
        </>}
        confirmLabel={t('Confirm submission')}
        cancelLabel={t('Return to answers')}
        onConfirm={() => { setConfirmOpened(false); void handleSubmit(); }}
      />
      {displayedResult && (
        <SubmissionResultModal
          opened={resultOpened}
          record={displayedResult}
          objective
          onClose={() => setResultOpened(false)}
          onViewDetails={() => {
            void navigate(buildUrl('record_detail', { rid: displayedResult.rid }, getSubmissionRecordQuery(window.location.search, args.tdoc)));
          }}
        />
      )}
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
