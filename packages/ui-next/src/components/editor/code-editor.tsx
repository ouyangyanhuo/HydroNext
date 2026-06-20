import { Center, Loader } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import themeList from 'monaco-themes/themes/themelist.json';

const LANG_MAP: Record<string, string> = {
  bash: 'shell',
  c: 'c',
  cc: 'cpp', 'cc.cc98': 'cpp', 'cc.cc98o2': 'cpp',
  'cc.cc11': 'cpp', 'cc.cc11o2': 'cpp',
  'cc.cc14': 'cpp', 'cc.cc14o2': 'cpp',
  'cc.cc17': 'cpp', 'cc.cc17o2': 'cpp',
  'cc.cc20': 'cpp', 'cc.cc20o2': 'cpp',
  cs: 'csharp',
  go: 'go',
  hs: 'haskell',
  java: 'java',
  js: 'javascript',
  kt: 'kotlin', 'kt.jvm': 'kotlin',
  pas: 'pascal',
  php: 'php',
  py: 'python', 'py.py2': 'python', 'py.py3': 'python', 'py.pypy3': 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  ts: 'typescript',
};

function resolveMonacoLang(lang: string): string {
  return LANG_MAP[lang] || lang || 'plaintext';
}

let monacoInstance: typeof import('monaco-editor') | null = null;
const themeModules = import.meta.glob('../../../../../node_modules/monaco-themes/themes/*.json');
const loadedThemes: Record<string, boolean> = {};

export const EDITOR_THEME_OPTIONS = [
  { value: '', label: 'Default' },
  ...Object.entries(themeList).map(([value, label]) => ({ value, label: String(label) })),
];

export interface EditorConfig {
  fontSize?: number;
  tabSize?: number;
  theme?: string;
}

export function loadStoredEditorConfig(): EditorConfig {
  try {
    const value = JSON.parse(localStorage.getItem('editor.config') || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export function saveStoredEditorConfig(config: EditorConfig) {
  localStorage.setItem('editor.config', JSON.stringify(config));
}

async function getMonaco() {
  if (monacoInstance) return monacoInstance;
  const m = await import('monaco-editor');
  (self as any).MonacoEnvironment = {
    getWorker(_: any, label: string) {
      const lang = label.toLowerCase();
      if (['javascript', 'typescript'].includes(lang)) {
        return import('monaco-editor/esm/vs/language/typescript/ts.worker?worker').then((w) => new w.default());
      }
      if (['json'].includes(lang)) {
        return import('monaco-editor/esm/vs/language/json/json.worker?worker').then((w) => new w.default());
      }
      if (['css', 'scss', 'less'].includes(lang)) {
        return import('monaco-editor/esm/vs/language/css/css.worker?worker').then((w) => new w.default());
      }
      if (['html'].includes(lang)) {
        return import('monaco-editor/esm/vs/language/html/html.worker?worker').then((w) => new w.default());
      }
      return import('monaco-editor/esm/vs/editor/editor.worker?worker').then((w) => new w.default());
    },
  };
  monacoInstance = m;
  return m;
}

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onContentChange?: (event: any, editor: any) => void;
  onMount?: (editor: any, monaco: typeof import('monaco-editor')) => void;
  language?: string;
  readOnly?: boolean;
  height?: string | number;
  fontSize?: number;
  tabSize?: number;
  theme?: string;
  minimap?: boolean;
  wordWrap?: 'on' | 'off';
}

function getDefaultTheme(theme?: string) {
  if (theme) return theme;
  return document.documentElement.getAttribute('data-mantine-color-scheme') === 'dark' ? 'vs-dark' : 'vs';
}

async function applyEditorTheme(monaco: typeof import('monaco-editor'), theme?: string) {
  const target = getDefaultTheme(theme);
  if (['vs', 'vs-dark', 'hc-black', 'hc-light'].includes(target)) {
    monaco.editor.setTheme(target);
    return;
  }

  if (!loadedThemes[target]) {
    const label = themeList[target as keyof typeof themeList];
    const key = Object.keys(themeModules).find((item) => item.endsWith(`/${label}.json`));
    const loader = key ? themeModules[key] : null;
    if (!loader) {
      monaco.editor.setTheme(getDefaultTheme());
      return;
    }
    const mod: any = await loader();
    monaco.editor.defineTheme(target, mod.default || mod);
    loadedThemes[target] = true;
  }
  monaco.editor.setTheme(target);
}

export function CodeEditor({
  value,
  onChange,
  onContentChange,
  onMount,
  language = 'plaintext',
  readOnly = false,
  height = 400,
  fontSize = 14,
  tabSize = 4,
  theme,
  minimap = false,
  wordWrap = 'on',
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    getMonaco().then((monaco) => {
      if (disposed || !containerRef.current) return;
      monacoRef.current = monaco;
      const editor = monaco.editor.create(containerRef.current, {
        value,
        language: resolveMonacoLang(language),
        readOnly,
        minimap: { enabled: minimap },
        scrollBeyondLastLine: false,
        fontSize,
        lineNumbers: 'on',
        automaticLayout: true,
        tabSize,
        insertSpaces: true,
        wordWrap,
        theme: getDefaultTheme(theme || loadStoredEditorConfig().theme),
      });
      editorRef.current = editor;
      applyEditorTheme(monaco, theme || loadStoredEditorConfig().theme);
      if (onChange || onContentChange) {
        editor.onDidChangeModelContent((event: any) => {
          if (onChange) onChange(editor.getValue());
          if (onContentChange) onContentChange(event, editor);
        });
      }
      onMount?.(editor, monaco);

      setLoading(false);
    });
    return () => { disposed = true; editorRef.current?.dispose(); };
  }, [language, readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      fontSize,
      tabSize,
      insertSpaces: true,
      minimap: { enabled: minimap },
      wordWrap,
    });
  }, [fontSize, tabSize, minimap, wordWrap]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco) applyEditorTheme(monaco, theme || loadStoredEditorConfig().theme);
  }, [theme]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    monaco.editor.setModelLanguage(model, resolveMonacoLang(language));
  }, [language]);

  return (
    <div style={{ position: 'relative', height }}>
      {loading && <Center style={{ position: 'absolute', inset: 0, zIndex: 1 }}><Loader size="sm" /></Center>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
