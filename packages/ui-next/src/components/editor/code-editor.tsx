import { useEffect, useRef, useState } from 'react';
import { Center, Loader } from '@mantine/core';

const LANG_MAP: Record<string, string> = {
  cc: 'cpp', 'cc.cc98': 'cpp', 'cc.cc11': 'cpp', 'cc.cc14': 'cpp', 'cc.cc17': 'cpp', 'cc.cc20': 'cpp',
  c: 'c', py: 'python', 'py.py3': 'python', 'py.pypy3': 'python', java: 'java',
  'kt.jvm': 'kotlin', pas: 'pascal', rs: 'rust', go: 'go', hs: 'haskell',
  rb: 'ruby', cs: 'csharp', php: 'php', js: 'javascript', ts: 'typescript', bash: 'shell',
};

function resolveMonacoLang(lang: string): string {
  return LANG_MAP[lang] || lang || 'plaintext';
}

let monacoInstance: typeof import('monaco-editor') | null = null;

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
  language?: string;
  readOnly?: boolean;
  height?: string | number;
}

export function CodeEditor({ value, onChange, language = 'plaintext', readOnly = false, height = 400 }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    getMonaco().then((monaco) => {
      if (disposed || !containerRef.current) return;
      const editor = monaco.editor.create(containerRef.current, {
        value,
        language: resolveMonacoLang(language),
        readOnly,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        lineNumbers: 'on',
        automaticLayout: true,
        tabSize: 4,
        wordWrap: 'on',
        theme: document.documentElement.getAttribute('data-mantine-color-scheme') === 'dark' ? 'vs-dark' : 'vs',
      });
      editorRef.current = editor;
      if (onChange) editor.onDidChangeModelContent(() => onChange(editor.getValue()));
      setLoading(false);
    });
    return () => { disposed = true; editorRef.current?.dispose(); };
  }, [language, readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  return (
    <div style={{ position: 'relative', height }}>
      {loading && <Center style={{ position: 'absolute', inset: 0, zIndex: 1 }}><Loader size="sm" /></Center>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
