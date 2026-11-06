export type ObjectiveAnswers = Record<string, string | string[]>;

const questionId = /^\d+(?:-\d+)?$/;

/** Only answer values belong in drafts and submissions, never problem configuration. */
export function normalizeObjectiveAnswers(value: unknown): ObjectiveAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const answers: ObjectiveAnswers = {};
  for (const [id, answer] of Object.entries(value)) {
    if (!questionId.test(id)) continue;
    if (typeof answer === 'string') answers[id] = answer;
    else if (Array.isArray(answer) && answer.every((item) => typeof item === 'string')) {
      answers[id] = [...new Set<string>(answer)].sort();
    }
  }
  return answers;
}

export function hasObjectiveAnswer(answer: string | string[] | undefined) {
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim());
}

export function objectiveDraftKey(userId: string | number, domainId: string, pid: string | number, tid?: string) {
  return `hydro-objective:v1:${JSON.stringify([String(userId), domainId, String(pid), tid || ''])}`;
}

export function readObjectiveDraft(storage: Pick<Storage, 'getItem'>, key: string): ObjectiveAnswers {
  try {
    const draft = JSON.parse(storage.getItem(key) || 'null');
    return draft?.version === 1 ? normalizeObjectiveAnswers(draft.answers) : {};
  } catch {
    return {};
  }
}

export function objectiveCaseId(item: { subtaskId?: number, id?: number }) {
  return item.id == null || !Number.isFinite(item.id) ? String(item.subtaskId) : `${item.subtaskId}-${item.id}`;
}
