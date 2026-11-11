import type * as Monaco from 'monaco-editor';
import { ensureEditorLanguage } from './language-support';

export const CODE_MODEL_SCHEME = 'hydro-user-code';
const installed = new WeakSet<typeof Monaco>();
const excludedToken = /(?:^|\.)(?:comment|string|regexp|number)(?:\.|$)/;
const identifier = /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u;
const MAX_INDEX_LENGTH = 1_000_000;
const MAX_SUGGESTIONS = 100;

interface WordIndex {
  version: number;
  language: string;
  tokens: Monaco.Token[][];
  words: Map<string, number>;
}

/** This exclusive, scheme-scoped provider also suppresses built-in language-service completion lists. */
export function installDocumentCompletions(monaco: typeof Monaco) {
  if (installed.has(monaco)) return;
  const indexes = new WeakMap<Monaco.editor.ITextModel, WordIndex>();
  // Stay exclusive for worker-unsynchronized models too; only the provided model is ever read.
  monaco.languages.registerCompletionItemProvider({ scheme: CODE_MODEL_SCHEME, exclusive: true, hasAccessToAllModels: true }, {
    async provideCompletionItems(model, position, _context, cancellation) {
      if (model.uri.scheme !== CODE_MODEL_SCHEME || model.isDisposed() || cancellation.isCancellationRequested) return { suggestions: [] };
      const version = model.getVersionId();
      const language = model.getLanguageId();
      const word = model.getWordUntilPosition(position);
      if (!identifier.test(word.word) || model.getValueLength() > MAX_INDEX_LENGTH) return { suggestions: [] };
      try {
        await ensureEditorLanguage(monaco, language);
      } catch {
        return { suggestions: [] };
      }
      if (model.isDisposed() || cancellation.isCancellationRequested || model.getVersionId() !== version
        || model.getLanguageId() !== language) return { suggestions: [] };
      let index = indexes.get(model);
      if (!index || index.version !== version || index.language !== language) {
        const lines = model.getLinesContent();
        const tokens = monaco.editor.tokenize(lines.join('\n'), language);
        // Unknown/unready grammars must not turn comments and strings into a word list.
        if (!tokens.some((line) => line.some((token) => token.type))) return { suggestions: [] };
        const words = new Map<string, number>();
        for (let line = 0; line < lines.length; line++) {
          const spans = tokens[line] || [];
          for (let part = 0; part < spans.length; part++) {
            if (excludedToken.test(spans[part].type)) continue;
            const text = lines[line].slice(spans[part].offset, spans[part + 1]?.offset);
            for (const match of text.matchAll(/[\p{ID_Start}_$][\p{ID_Continue}$]*/gu)) {
              words.set(match[0], (words.get(match[0]) || 0) + 1);
            }
          }
        }
        index = { version, language, tokens, words };
        indexes.set(model, index);
      }
      const spans = index.tokens[position.lineNumber - 1] || [];
      const token = [...spans].reverse().find((span) => span.offset <= word.startColumn - 1);
      if (!token || excludedToken.test(token.type)) return { suggestions: [] };
      const fullWord = model.getWordAtPosition(position);
      const prefix = word.word.toLowerCase();
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, fullWord?.endColumn || word.endColumn);
      const suggestions: Monaco.languages.CompletionItem[] = [];
      for (const [name, count] of index.words) {
        if (name === word.word || !name.toLowerCase().startsWith(prefix) || (name === fullWord?.word && count === 1)) continue;
        suggestions.push({ label: name, insertText: name, kind: monaco.languages.CompletionItemKind.Text, range });
        if (suggestions.length >= MAX_SUGGESTIONS) break;
      }
      return { suggestions };
    },
  });
  installed.add(monaco);
}
