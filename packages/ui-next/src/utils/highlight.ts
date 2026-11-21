import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import delphi from 'highlight.js/lib/languages/delphi';
import go from 'highlight.js/lib/languages/go';
import haskell from 'highlight.js/lib/languages/haskell';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import matlab from 'highlight.js/lib/languages/matlab';
import perl from 'highlight.js/lib/languages/perl';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, any> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  delphi,
  go,
  haskell,
  html: xml,
  java,
  javascript,
  json,
  kotlin,
  lua,
  markdown,
  matlab,
  pascal: delphi,
  perl,
  php,
  plaintext,
  python,
  r,
  ruby,
  rust,
  scala,
  shell: bash,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

for (const [name, definition] of Object.entries(LANGUAGES)) {
  if (!hljs.getLanguage(name)) {
    hljs.registerLanguage(name, definition);
  }
}

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  'c++': 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  csharp: 'csharp',
  css: 'css',
  cxx: 'cpp',
  delphi: 'delphi',
  go: 'go',
  golang: 'go',
  haskell: 'haskell',
  hs: 'haskell',
  html: 'html',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  kotlin: 'kotlin',
  kt: 'kotlin',
  lua: 'lua',
  markdown: 'markdown',
  matlab: 'matlab',
  md: 'markdown',
  node: 'javascript',
  nodejs: 'javascript',
  pas: 'pascal',
  pascal: 'pascal',
  perl: 'perl',
  php: 'php',
  pl: 'perl',
  plain: 'plaintext',
  plaintext: 'plaintext',
  py: 'python',
  py2: 'python',
  py3: 'python',
  pypy: 'python',
  pypy2: 'python',
  pypy3: 'python',
  python: 'python',
  python2: 'python',
  python3: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  ruby: 'ruby',
  rust: 'rust',
  scala: 'scala',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  swift: 'swift',
  text: 'plaintext',
  ts: 'typescript',
  txt: 'plaintext',
  typescript: 'typescript',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

const MAX_HIGHLIGHT_LENGTH = 200_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function resolveHighlightLanguage(lang?: string): string {
  if (!lang) return 'plaintext';
  const normalized = lang.trim().toLowerCase();
  const base = normalized.split('.')[0];
  const candidate = LANGUAGE_ALIASES[normalized] || LANGUAGE_ALIASES[base] || base;
  return hljs.getLanguage(candidate) ? candidate : 'plaintext';
}

/**
 * Splits highlight.js HTML into individual lines while preserving open <span>
 * tags across line breaks (e.g. multiline comments and strings).
 */
export function splitHighlightedLines(html: string): string[] {
  const normalized = html.replace(/\r\n?/g, '\n');
  const openTags: string[] = [];
  const lines: string[] = [];
  let current = '';
  const tokenPattern = /<span\b[^>]*>|<\/span>|\n/g;
  let lastIndex = 0;
  let match = tokenPattern.exec(normalized);

  while (match !== null) {
    current += normalized.slice(lastIndex, match.index);
    const token = match[0];
    if (token === '\n') {
      current += '</span>'.repeat(openTags.length);
      lines.push(current);
      current = openTags.join('');
    } else if (token === '</span>') {
      if (openTags.length > 0) openTags.pop();
      current += token;
    } else {
      openTags.push(token);
      current += token;
    }
    lastIndex = tokenPattern.lastIndex;
    match = tokenPattern.exec(normalized);
  }

  current += normalized.slice(lastIndex);
  current += '</span>'.repeat(openTags.length);
  lines.push(current);
  return lines;
}

export function highlightCodeLines(code: string, lang?: string): { lines: string[], language: string } {
  const normalizedCode = code.replace(/\r\n?/g, '\n');
  const language = resolveHighlightLanguage(lang);
  if (!normalizedCode) {
    return { lines: [''], language };
  }
  if (normalizedCode.length > MAX_HIGHLIGHT_LENGTH || language === 'plaintext') {
    return {
      lines: normalizedCode.split('\n').map(escapeHtml),
      language: 'plaintext',
    };
  }
  try {
    const highlighted = hljs.highlight(normalizedCode, { language, ignoreIllegals: true }).value;
    return {
      lines: splitHighlightedLines(highlighted),
      language,
    };
  } catch {
    return {
      lines: normalizedCode.split('\n').map(escapeHtml),
      language: 'plaintext',
    };
  }
}
