import type * as Monaco from 'monaco-editor';

type MonacoApi = typeof Monaco;
interface Symbols { functions: string[], types: string[], variables: string[] }

const c: Symbols = {
  functions: ('printf scanf getchar putchar puts fgets fputs fopen fclose fread fwrite fflush '
    + 'malloc calloc realloc free memcpy memmove memset memcmp strlen strcmp strncmp strcpy strncpy strcat '
    + 'qsort bsearch abs labs llabs sqrt pow sin cos floor ceil round fabs getchar_unlocked').split(' '),
  types: ['size_t', 'FILE', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint32_t', 'uint64_t'],
  variables: ['stdin', 'stdout', 'stderr', 'NULL', 'EOF'],
};
const node: Symbols = {
  functions: ('require parseInt parseFloat isNaN isFinite setTimeout clearTimeout setInterval clearInterval '
    + 'setImmediate clearImmediate queueMicrotask readFileSync readFile writeFileSync createInterface '
    + 'log error warn info debug resolve reject all allSettled race then map filter reduce '
    + 'forEach sort join split trim push pop shift unshift slice splice includes indexOf charCodeAt').split(' '),
  types: ['Buffer', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Date', 'RegExp', 'Error', 'BigInt', 'Symbol'],
  variables: ['console', 'process', 'module', 'exports', '__dirname', '__filename', 'global', 'globalThis', 'JSON', 'Math', 'fs', 'readline'],
};

export const EDITOR_SYMBOLS: Record<string, Symbols> = {
  c,
  javascript: node,
  typescript: node,
  cpp: {
    functions: [...c.functions, ...('sort stable_sort reverse swap min max min_element max_element lower_bound upper_bound '
      + 'binary_search find count accumulate iota next_permutation prev_permutation unique distance begin end '
      + 'make_pair make_tuple push_back emplace_back pop_back push pop top front back empty size resize reserve '
      + 'insert erase clear count find getline stoi stoll stod to_string').split(' ')],
    types: [...c.types, ...('string string_view vector array pair tuple map unordered_map set unordered_set multiset '
      + 'queue priority_queue stack deque bitset').split(' ')],
    variables: [...c.variables, 'std', 'cin', 'cout', 'cerr', 'endl'],
  },
  java: {
    functions: ('println print printf next nextLine nextInt nextLong nextDouble hasNext read readLine '
      + 'parseInt parseLong parseDouble valueOf toString charAt length substring equals compareTo '
      + 'sort binarySearch fill min max abs pow sqrt add get set put remove contains size isEmpty').split(' '),
    types: ('String StringBuilder System Math Integer Long Double Character Arrays Collections Scanner '
      + 'BufferedReader InputStreamReader PrintWriter ArrayList HashMap HashSet TreeMap TreeSet PriorityQueue ArrayDeque').split(' '),
    variables: ['out', 'in', 'err'],
  },
  python: {
    functions: ('print input len range int float str list tuple dict set sorted reversed enumerate zip map filter '
      + 'sum min max abs pow round any all open isinstance append extend insert pop remove '
      + 'split join strip read readline write heappush heappop bisect_left bisect_right').split(' '),
    types: ['Counter', 'defaultdict', 'deque'],
    variables: ['sys', 'math', 'heapq', 'bisect', 'collections', 'stdin', 'stdout'],
  },
  rust: {
    functions: ('println print eprintln format vec read_to_string read_line split_whitespace parse collect '
      + 'unwrap expect iter iter_mut into_iter map filter fold sum sort sort_unstable sort_by binary_search '
      + 'push pop insert remove get len is_empty new from min max abs').split(' '),
    types: ['String', 'Vec', 'Option', 'Result', 'HashMap', 'HashSet', 'BTreeMap', 'BTreeSet', 'BinaryHeap', 'VecDeque'],
    variables: ['std', 'Some', 'None', 'Ok', 'Err'],
  },
};

const loaders: Record<string, () => Promise<any>> = {
  c: () => import('monaco-editor/languages/definitions/cpp/cpp.js'),
  cpp: () => import('monaco-editor/languages/definitions/cpp/cpp.js'),
  java: () => import('monaco-editor/languages/definitions/java/java.js'),
  python: () => import('monaco-editor/languages/definitions/python/python.js'),
  rust: () => import('monaco-editor/languages/definitions/rust/rust.js'),
  javascript: () => import('monaco-editor/languages/definitions/javascript/javascript.js'),
  typescript: () => import('monaco-editor/languages/definitions/typescript/typescript.js'),
};
const initialized = new WeakMap<MonacoApi, Map<string, Promise<void>>>();

/** Load syntax/highlighting only. Knowing a symbol must never make it a completion candidate. */
export function ensureEditorLanguage(monaco: MonacoApi, languageId: string): Promise<void> {
  const registered = monaco.languages.getLanguages().find(({ id }) => id === languageId) as
    (Monaco.languages.ILanguageExtensionPoint & { loader?: () => Promise<any> }) | undefined;
  const loader = loaders[languageId] || registered?.loader;
  if (!loader) return Promise.resolve();
  let cache = initialized.get(monaco);
  if (!cache) {
    cache = new Map();
    initialized.set(monaco, cache);
  }
  const existing = cache.get(languageId);
  if (existing) return existing;
  const pending = loader().then((definition) => {
    if (!monaco.languages.getLanguages().some(({ id }) => id === languageId)) monaco.languages.register({ id: languageId });
    const symbols = EDITOR_SYMBOLS[languageId] || { functions: [], types: [], variables: [] };
    const names = [...new Set([...symbols.functions, ...symbols.types, ...symbols.variables])];
    const language = {
      ...definition.language,
      keywords: [...new Set([...(definition.language.keywords || []), ...(languageId === 'cpp'
        ? ['concept', 'requires', 'consteval', 'constinit', 'char8_t', 'co_await', 'co_return', 'co_yield', 'import', 'module'] : [])])],
    };
    const functionRule: Monaco.languages.IMonarchLanguageRule = [
      /[a-zA-Z_$][\w$]*(?=\s*(?:!\s*)?\()/,
      { cases: { '@keywords': 'keyword', '@default': 'variable.function' } },
    ];
    // Definitions and calls are syntax-colored; this does not claim a function exists or type-checks.
    const extraRules: Monaco.languages.IMonarchLanguageRule[] = [
      ...(names.length ? [[new RegExp(`(?:${names.join('|')})\\b`), 'type.identifier'] as Monaco.languages.IMonarchLanguageRule] : []),
      ...(languageId === 'javascript' || languageId === 'typescript' ? [[
        /[a-zA-Z_$][\w$]*(?=\s*=\s*(?:(?:async\s+)?function\b|(?:async\s+)?(?:[a-zA-Z_$][\w$]*|\([^)]*\))\s*=>))/,
        'variable.function',
      ] as Monaco.languages.IMonarchLanguageRule] : []),
      functionRule,
    ];
    monaco.languages.setMonarchTokensProvider(languageId, {
      ...language,
      tokenizer: {
        ...language.tokenizer,
        root: [...extraRules, ...language.tokenizer.root],
        ...(language.tokenizer.common ? { common: [...extraRules, ...language.tokenizer.common] } : {}),
      },
    });
    monaco.languages.setLanguageConfiguration(languageId, definition.conf);
  }).catch((error) => {
    cache.delete(languageId);
    throw error;
  });
  cache.set(languageId, pending);
  return pending;
}
