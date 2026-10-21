type BuildUrl = (route: string, params?: Record<string, string | number>, query?: Record<string, string>) => string;
interface Problem {
  docId: number;
  pid?: string;
  title?: string;
}

export interface ProblemNavigationItem {
  pid: string | number;
  title?: string;
  href: string;
}

export interface ProblemNavigationData {
  source: string;
  sourceUrl: string;
  previous: ProblemNavigationItem | null;
  next: ProblemNavigationItem | null;
}

export interface ProblemNavigationOptions {
  problem: Problem;
  contest?: { docId?: string, _id?: string, pids?: number[] };
  search: string;
  buildUrl: BuildUrl;
  load: (url: string) => Promise<any>;
}

const CHANGED = 'This problem is no longer in the source list. Return to the list to continue.';

function pickQuery(query: URLSearchParams, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => query.has(key)).map((key) => [key, query.get(key)!]));
}

/** Carry navigation state, not arbitrary URLs or client-provided problem lists. */
export function getProblemNavigationQuery(search: string, contest?: ProblemNavigationOptions['contest']): Record<string, string> {
  const query = new URLSearchParams(search);
  const lang = pickQuery(query, ['lang']);
  const tid = contest?.docId || contest?._id || query.get('tid');
  if (tid && /^[a-f\d]{24}$/i.test(String(tid))) return { ...lang, tid: String(tid) };
  if (query.get('nav') === 'training' && /^[a-f\d]{24}$/i.test(query.get('training') || '') && /^[1-9]\d*$/.test(query.get('chapter') || '')) {
    return { ...lang, ...pickQuery(query, ['nav', 'training', 'chapter', 'page', 'q', 'category', 'sort', 'uid', 'viewRecords']) };
  }
  const page = Number(query.get('page') || 1);
  if (query.get('nav') === 'list' && Number.isSafeInteger(page) && page > 0) {
    return { ...lang, ...pickQuery(query, ['nav', 'page', 'q', 'sort']) };
  }
  return lang;
}

/** Namespace problem state so it cannot collide with record-page query fields. */
export function getSubmissionRecordQuery(
  search: string, contest?: ProblemNavigationOptions['contest'], source?: 'editor',
): Record<string, string> {
  const context = new URLSearchParams(getProblemNavigationQuery(search, contest)).toString();
  return { ...(context ? { problemNav: context } : {}), ...(source === 'editor' ? { submissionSource: source } : {}) };
}

export function getRecordProblemQuery(search: string, contest?: ProblemNavigationOptions['contest']) {
  return getProblemNavigationQuery(new URLSearchParams(search).get('problemNav') || '', contest);
}

/** Keep editor mode in the document URL so refresh and native history restore it. */
export function getProblemEditorUrl(href: string, open: boolean) {
  const url = new URL(href);
  if (open) url.searchParams.set('mode', 'code');
  else url.searchParams.delete('mode');
  return url.pathname + url.search + url.hash;
}

/** Only the formal editor-submit flow opts into result-aware return navigation. */
export function getRecordReturnQuery(search: string, accepted: boolean, contest?: ProblemNavigationOptions['contest']) {
  if (new URLSearchParams(search).get('submissionSource') !== 'editor') return null;
  const query = getRecordProblemQuery(search, contest);
  return accepted ? query : { ...query, mode: 'code' };
}

export function getProblemNavigationSource({ contest, search, buildUrl }: Pick<ProblemNavigationOptions, 'contest' | 'search' | 'buildUrl'>) {
  const query = new URLSearchParams(search);
  const tid = contest?.docId || contest?._id;
  if (tid) return { source: 'Contest', sourceUrl: buildUrl('contest_problemlist', { tid: String(tid) }) };
  if (query.get('nav') === 'training' && /^[a-f\d]{24}$/i.test(query.get('training') || '') && /^[1-9]\d*$/.test(query.get('chapter') || '')) {
    return {
      source: 'Training',
      sourceUrl: buildUrl('training_detail', { tid: query.get('training')! },
        pickQuery(query, ['page', 'q', 'category', 'sort', 'uid', 'viewRecords'])),
    };
  }
  const page = Number(query.get('page') || 1);
  if (query.get('nav') === 'list' && Number.isSafeInteger(page) && page > 0) {
    return { source: 'Problem List', sourceUrl: buildUrl('problem_main', {}, { ...pickQuery(query, ['q', 'sort']), page: String(page) }) };
  }
  return null;
}

/** Resolve from permission-checked source pages, never from a client-supplied list of problem IDs. */
export async function resolveProblemNavigation(options: ProblemNavigationOptions): Promise<ProblemNavigationData | null> {
  const { problem, contest, search, buildUrl, load } = options;
  const source = getProblemNavigationSource(options);
  if (!source) return null;
  const query = new URLSearchParams(search);
  const lang = pickQuery(query, ['lang']);
  const item = (pdoc: Problem | undefined, context: Record<string, string>): ProblemNavigationItem | null => pdoc ? {
    pid: pdoc.pid || pdoc.docId,
    title: pdoc.title,
    href: buildUrl('problem_detail', { pid: pdoc.pid || pdoc.docId }, { ...context, ...lang }),
  } : null;
  const tid = contest?.docId || contest?._id;
  if (tid) {
    const pids = contest.pids || [];
    const index = pids.indexOf(problem.docId);
    if (index < 0) throw new Error(CHANGED);
    return {
      ...source,
      previous: item(index > 0 ? { docId: pids[index - 1] } : undefined, { tid: String(tid) }),
      next: item(index + 1 < pids.length ? { docId: pids[index + 1] } : undefined, { tid: String(tid) }),
    };
  }
  if (query.get('nav') === 'training') {
    const training = query.get('training') || '';
    const chapter = query.get('chapter') || '';
    if (!/^[a-f\d]{24}$/i.test(training) || !/^[1-9]\d*$/.test(chapter)) throw new Error(CHANGED);
    const sourceQuery = pickQuery(query, ['page', 'q', 'category', 'sort', 'uid', 'viewRecords']);
    const data = await load(source.sourceUrl);
    const node = (data.tdoc?.dag || data.tdoc?.sections || []).find((entry: any, index: number) => String(entry._id ?? index + 1) === chapter);
    if (!node || data.nsdict?.[chapter]?.isInvalid) throw new Error(CHANGED);
    const problems: Problem[] = (node.pids || []).map((pid: number) => data.pdict?.[pid]).filter((pdoc: Problem) => pdoc?.docId);
    const index = problems.findIndex((pdoc) => pdoc.docId === problem.docId);
    if (index < 0) throw new Error(CHANGED);
    const context = { ...sourceQuery, nav: 'training', training, chapter };
    return {
      ...source,
      previous: item(problems[index - 1], context), next: item(problems[index + 1], context),
    };
  }
  if (query.get('nav') !== 'list') return null;
  const page = Number(query.get('page') || 1);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error(CHANGED);
  const filters = pickQuery(query, ['q', 'sort']);
  const listUrl = (targetPage: number) => buildUrl('problem_main', {}, { ...filters, page: String(targetPage) });
  const data = await load(listUrl(page));
  const problems: Problem[] = data.pdocs || [];
  const index = problems.findIndex((pdoc) => pdoc.docId === problem.docId);
  if (index < 0) throw new Error(CHANGED);
  const [before, after] = await Promise.all([
    index === 0 && page > 1 ? load(listUrl(page - 1)) : null,
    index === problems.length - 1 && page < Number(data.ppcount) ? load(listUrl(page + 1)) : null,
  ]);
  return {
    ...source,
    previous: item(index > 0 ? problems[index - 1] : before?.pdocs?.at(-1), {
      ...filters, nav: 'list', page: String(index > 0 ? page : page - 1),
    }),
    next: item(index + 1 < problems.length ? problems[index + 1] : after?.pdocs?.[0], {
      ...filters, nav: 'list', page: String(index + 1 < problems.length ? page : page + 1),
    }),
  };
}
