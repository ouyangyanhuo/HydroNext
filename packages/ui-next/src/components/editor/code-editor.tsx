/* eslint-disable react-refresh/only-export-components */
import { Center, Loader } from '@mantine/core';
import themeList from 'monaco-themes/themes/themelist.json';
import { useEffect, useRef, useState } from 'react';
import { CODE_MODEL_SCHEME, installDocumentCompletions } from './document-completions';
import { resolveEditorLanguage } from './editor-language';
import { ensureEditorLanguage } from './language-support';

let monacoInstance: typeof import('monaco-editor') | null = null;
const themeModules = import.meta.glob('../../../../../node_modules/monaco-themes/themes/*.json');
const loadedThemes: Record<string, boolean> = {};
let modelSequence = 0;

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
  (self as any).MonacoEnvironment = {
    getWorker(_: any, label: string) {
      const lang = label.toLowerCase();
      if (['javascript', 'typescript'].includes(lang)) {
        return import('monaco-editor/languages/features/typescript/ts.worker.js?worker').then(({ default: Worker }) => new Worker());
      }
      if (['json'].includes(lang)) {
        return import('monaco-editor/languages/features/json/json.worker.js?worker').then(({ default: Worker }) => new Worker());
      }
      if (['css', 'scss', 'less'].includes(lang)) {
        return import('monaco-editor/languages/features/css/css.worker.js?worker').then(({ default: Worker }) => new Worker());
      }
      if (['html'].includes(lang)) {
        return import('monaco-editor/languages/features/html/html.worker.js?worker').then(({ default: Worker }) => new Worker());
      }
      return import('monaco-editor/editor/editor.worker.js?worker').then(({ default: Worker }) => new Worker());
    },
  };
  const m = await import('monaco-editor');
  monacoInstance = m;
  return m;
}

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onContentChange?: (event: any, editor: any, previousValue: string) => void;
  onPaste?: (characters: number) => void;
  onMount?: (editor: any, monaco: typeof import('monaco-editor')) => void;
  language?: string;
  readOnly?: boolean;
  height?: string | number;
  fontSize?: number;
  tabSize?: number;
  theme?: string;
  minimap?: boolean;
  wordWrap?: 'on' | 'off';
  documentOnlySuggestions?: boolean;
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
  onPaste,
  onMount,
  language = 'plaintext',
  readOnly = false,
  height = 400,
  fontSize = 14,
  tabSize = 4,
  theme,
  minimap = false,
  wordWrap = 'on',
  documentOnlySuggestions = false,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const onChangeRef = useRef(onChange);
  const onContentChangeRef = useRef(onContentChange);
  const onPasteRef = useRef(onPaste);
  const onMountRef = useRef(onMount);
  const optionsRef = useRef({ value, language, readOnly, minimap, fontSize, tabSize, wordWrap, theme });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onChangeRef.current = onChange;
    onContentChangeRef.current = onContentChange;
    onPasteRef.current = onPaste;
    onMountRef.current = onMount;
  }, [onChange, onContentChange, onMount, onPaste]);

  useEffect(() => {
    optionsRef.current = { value, language, readOnly, minimap, fontSize, tabSize, wordWrap, theme };
  }, [value, language, readOnly, minimap, fontSize, tabSize, wordWrap, theme]);

  useEffect(() => {
    let disposed = false;
    let ownedModel: import('monaco-editor').editor.ITextModel | undefined;
    getMonaco().then((monaco) => {
      if (disposed || !containerRef.current) return;
      // Monaco loads asynchronously; use the latest committed props, not mount-time readOnly.
      const initial = optionsRef.current;
      monacoRef.current = monaco;
      if (documentOnlySuggestions) {
        installDocumentCompletions(monaco);
        ownedModel = monaco.editor.createModel(initial.value, resolveEditorLanguage(initial.language),
          monaco.Uri.parse(`${CODE_MODEL_SCHEME}:///model/${++modelSequence}`));
        ownedModel.updateOptions({ tabSize: initial.tabSize, insertSpaces: true });
      }
      const editor = monaco.editor.create(containerRef.current, {
        ...(ownedModel ? { model: ownedModel } : { value: initial.value, language: resolveEditorLanguage(initial.language) }),
        readOnly: initial.readOnly,
        minimap: { enabled: initial.minimap },
        scrollBeyondLastLine: false,
        fontSize: initial.fontSize,
        lineNumbers: 'on',
        automaticLayout: true,
        tabSize: initial.tabSize,
        insertSpaces: true,
        wordWrap: initial.wordWrap,
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: !documentOnlySuggestions,
        wordBasedSuggestions: documentOnlySuggestions ? 'off' : 'currentDocument',
        ...(documentOnlySuggestions ? {
          tabCompletion: 'on',
          snippetSuggestions: 'none',
          inlineSuggest: { enabled: false },
          parameterHints: { enabled: false },
          acceptSuggestionOnEnter: 'off',
          suggest: { showSnippets: false, showWords: true, showInlineDetails: false },
        } as const : {}),
        theme: getDefaultTheme(initial.theme || loadStoredEditorConfig().theme),
      });
      editorRef.current = editor;
      applyEditorTheme(monaco, initial.theme || loadStoredEditorConfig().theme);
      if (onChangeRef.current || onContentChangeRef.current) {
        let previousValue = editor.getValue();
        editor.onDidChangeModelContent((event: any) => {
          const before = previousValue;
          previousValue = editor.getValue();
          onContentChangeRef.current?.(event, editor, before);
          onChangeRef.current?.(previousValue);
        });
      }
      onMountRef.current?.(editor, monaco);
      editor.onDidPaste((event: any) => {
        const text = editor.getModel()?.getValueInRange(event.range) || '';
        onPasteRef.current?.(Array.from(text).length);
      });

      setLoading(false);
    });
    return () => {
      disposed = true;
      editorRef.current?.dispose();
      ownedModel?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, [documentOnlySuggestions]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value, loading]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      fontSize,
      tabSize,
      readOnly,
      insertSpaces: true,
      minimap: { enabled: minimap },
      wordWrap,
    });
  }, [fontSize, tabSize, minimap, readOnly, wordWrap, loading]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco) applyEditorTheme(monaco, theme || loadStoredEditorConfig().theme);
  }, [theme, loading]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return undefined;
    const languageId = resolveEditorLanguage(language);
    monaco.editor.setModelLanguage(model, languageId);
    // Providers are shared and installed once, without changing the model or its replay history.
    let active = true;
    void ensureEditorLanguage(monaco, languageId).then(() => {
      if (active && editorRef.current === editor && editor.getModel() === model && model.getLanguageId?.() !== languageId) {
        monaco.editor.setModelLanguage(model, languageId);
      }
    }).catch((error) => {
      if (active) console.warn('Failed to load editor language hints', languageId, error);
    });
    return () => { active = false; };
  }, [language, loading]);

  return (
    <div style={{ position: 'relative', height }}>
      {loading && <Center style={{ position: 'absolute', inset: 0, zIndex: 1 }}><Loader size="sm" /></Center>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
