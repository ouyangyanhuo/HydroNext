interface LanguageConfig {
  monaco?: string;
  highlight?: string;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: 'shell', c: 'c', cc: 'cpp', 'c++': 'cpp', cpp: 'cpp', cs: 'csharp',
  go: 'go', hs: 'haskell', java: 'java', js: 'javascript', kt: 'kotlin', pas: 'pascal', php: 'php',
  py: 'python', py2: 'python', py3: 'python', python2: 'python', python3: 'python', pypy: 'python', pypy3: 'python',
  r: 'r', rb: 'ruby', rs: 'rust', ts: 'typescript',
  python: 'python', rust: 'rust', javascript: 'javascript', typescript: 'typescript', node: 'javascript', nodejs: 'javascript',
  kotlin: 'kotlin', pascal: 'pascal', ruby: 'ruby', csharp: 'csharp', 'c#': 'csharp', shell: 'shell', haskell: 'haskell',
};

/** Compiler IDs are not Monaco IDs. Prefer the server's editor mode, just like ui-default. */
export function resolveEditorLanguage(language: string, configured?: Record<string, LanguageConfig>) {
  const id = language.trim().toLowerCase();
  const configs = configured ?? (typeof window === 'undefined' ? {} : (window as any).HydroCodeLangs || (window as any).LANGS || {});
  const config = configs[language] || configs[id] || configs[id.split('.')[0]];
  const mode = (config?.monaco || config?.highlight || id).trim().toLowerCase().split(/\s+/)[0];
  return LANGUAGE_ALIASES[mode] || LANGUAGE_ALIASES[mode.split('.')[0]] || mode || 'plaintext';
}

/** A domain/problem may allow only a particular compiler variant of the preferred language. */
export function resolveLanguagePreference(available: string[], preferred = '') {
  if (available.includes(preferred)) return preferred;
  const family = preferred.split('.')[0];
  return preferred ? available.find((id) => id.split('.')[0] === family) || '' : '';
}
