import { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mantine/core';
import MarkdownIt from 'markdown-it';
import markPlugin from 'markdown-it-mark';
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/github.css';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import kotlin from 'highlight.js/lib/languages/kotlin';
import scala from 'highlight.js/lib/languages/scala';
import swift from 'highlight.js/lib/languages/swift';
import csharp from 'highlight.js/lib/languages/csharp';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import latex from 'highlight.js/lib/languages/latex';
import delphi from 'highlight.js/lib/languages/delphi';
import haskell from 'highlight.js/lib/languages/haskell';
import lua from 'highlight.js/lib/languages/lua';
import r from 'highlight.js/lib/languages/r';
import perl from 'highlight.js/lib/languages/perl';
import matlab from 'highlight.js/lib/languages/matlab';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('python', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('latex', latex);
hljs.registerLanguage('delphi', delphi);
hljs.registerLanguage('pascal', delphi);
hljs.registerLanguage('haskell', haskell);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('r', r);
hljs.registerLanguage('perl', perl);
hljs.registerLanguage('matlab', matlab);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('plaintext', plaintext);

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidDelim(state: any, pos: number) {
  const max = state.posMax;
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
  const nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;
  let canOpen = true;
  let canClose = true;
  if (prevChar === 0x09 || (nextChar >= 0x30 && nextChar <= 0x39)) canClose = false;
  if (nextChar === 0x09) canOpen = false;
  return { canOpen, canClose };
}

function mathInline(state: any, silent: boolean) {
  if (state.src[state.pos] !== '$') return false;
  let res = isValidDelim(state, state.pos);
  if (!res.canOpen) {
    if (!silent) state.pending += '$';
    state.pos += 1;
    return true;
  }
  const start = state.pos + 1;
  let match = start;
  while ((match = state.src.indexOf('$', match)) !== -1) {
    let pos = match - 1;
    while (state.src[pos] === '\\') pos -= 1;
    if ((match - pos) % 2) break;
    match += 1;
  }
  if (match === -1) {
    if (!silent) state.pending += '$';
    state.pos = start;
    return true;
  }
  if (match - start === 0) {
    if (!silent) state.pending += '$$';
    state.pos = start + 1;
    return true;
  }
  res = isValidDelim(state, match);
  if (!res.canClose) {
    if (!silent) state.pending += '$';
    state.pos = start;
    return true;
  }
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

function mathBlock(state: any, start: number, end: number, silent: boolean) {
  let pos = state.bMarks[start] + state.tShift[start];
  let max = state.eMarks[start];
  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== '$$') return false;
  pos += 2;
  let firstLine = state.src.slice(pos, max);
  if (silent) return true;
  let found = false;
  if (firstLine.trim().slice(-2) === '$$') {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }
  let next = start;
  let lastLine = '';
  while (!found) {
    next++;
    if (next >= end) break;
    pos = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
      const lastPos = state.src.slice(0, max).lastIndexOf('$$');
      lastLine = state.src.slice(pos, lastPos);
      found = true;
    }
  }
  state.line = next + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = (firstLine && firstLine.trim() ? `${firstLine}\n` : '')
    + state.getLines(start + 1, next, state.tShift[start], true)
    + (lastLine && lastLine.trim() ? lastLine : '');
  token.map = [start, state.line];
  token.markup = '$$';
  return true;
}

function katexPlugin(md: MarkdownIt) {
  const renderKatex = (latex: string, displayMode = false) => {
    const katex = (window as any).katex;
    if (!katex) return escapeHtml(latex);
    try {
      latex = latex.replace(/\\def\{\\([a-zA-Z0-9]+)\}/g, '\\def\\$1');
      return katex.renderToString(latex, { throwOnError: false, strict: 'ignore', displayMode });
    } catch (error: any) {
      return `<p class='${displayMode ? 'katex-block ' : ''}katex-error' title='${escapeHtml(error.toString())}'>${escapeHtml(latex)}</p>`;
    }
  };

  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.math_inline = (tokens, idx) => renderKatex(tokens[idx].content);
  md.renderer.rules.math_block = (tokens, idx) => `${renderKatex(tokens[idx].content, true)}\n`;
}

const EMBED_REGEX = /@\[([a-zA-Z].+?)\]\((.*?)\)/;

const FILE_ICON_MAP: Record<string, string> = {
  pdf: '📄', doc: '📝', docx: '📝', ppt: '📊', pptx: '📊', xls: '📈', xlsx: '📈',
};

function fileMediaPlugin(md: MarkdownIt) {
  md.inline.ruler.before('emphasis', 'file_media', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x40 || state.src.charCodeAt(state.pos + 1) !== 0x5B) return false;
    const match = EMBED_REGEX.exec(state.src.slice(state.pos));
    if (!match || match.length < 3) return false;
    const [, service, src] = match;
    if (!silent) {
      const token = state.push('file_media', '', 0);
      token.attrPush(['src', src]);
      token.attrPush(['service', service.toLowerCase()]);
      token.attrPush(['url', match[2]]);
    }
    state.pos += match[0].length;
    return true;
  });

  md.renderer.rules.file_media = (tokens, idx) => {
    let src = tokens[idx].attrGet('src') || '';
    const service = (tokens[idx].attrGet('service') || '').toLowerCase();
    const ext = src.split('.').pop()?.toLowerCase() || service;
    const isFile = src.startsWith('file://') || src.startsWith('./') || src.startsWith('../');
    const displayName = src.replace(/^file:\/\//, '').replace(/^\.\//, '');
    const icon = FILE_ICON_MAP[ext] || FILE_ICON_MAP[service] || '📎';
    const encodedName = encodeURIComponent(displayName);
    if (service === 'pdf' || ext === 'pdf') {
      if (isFile) {
        return `<div class="file-inline-viewer my-3 rounded-md border border-[var(--hydro-border)] overflow-hidden" data-file-src="${md.utils.escapeHtml(displayName)}" data-file-ext="pdf"><div class="flex items-center justify-center p-8 text-sm text-[var(--hydro-text-muted)]">${icon} Loading PDF...</div></div>`;
      }
      return `<iframe src="${md.utils.escapeHtml(src)}?noDisposition=1" style="width:100%;min-height:70vh;border:none;" allowfullscreen></iframe>`;
    }
    if (['docx', 'doc', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
      return `<div class="file-inline-viewer my-3 rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] p-4" data-file-src="${md.utils.escapeHtml(displayName)}" data-file-ext="${md.utils.escapeHtml(ext)}"><div class="flex items-center gap-2 text-sm text-[var(--hydro-text-muted)]">${icon} Loading ${md.utils.escapeHtml(displayName)}...</div></div>`;
    }
    if (isFile) {
      return `<a href="javascript:;" class="file-preview-link hydro-subtle-link inline-flex items-center gap-1 rounded border border-[var(--hydro-border)] bg-[var(--hydro-surface)] px-2 py-1 text-sm font-medium hover:bg-[var(--hydro-surface-muted)]" data-file-src="${md.utils.escapeHtml(displayName)}" data-file-ext="${md.utils.escapeHtml(ext)}">${icon} ${md.utils.escapeHtml(displayName)}</a>`;
    }
    return `<a href="${md.utils.escapeHtml(src)}" target="_blank" rel="noopener">${icon} ${md.utils.escapeHtml(displayName)}</a>`;
  };
}

const md = new MarkdownIt({
  linkify: true,
  html: true,
});

md.use(markPlugin);
md.use(katexPlugin);
md.use(fileMediaPlugin);

const LANG_LABELS: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  py: 'Python', python: 'Python', java: 'Java', cpp: 'C++', c: 'C', cc: 'C++',
  'c++': 'C++', 'c#': 'C#', cs: 'C#', csharp: 'C#', go: 'Go', rust: 'Rust',
  rb: 'Ruby', ruby: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin', kotlin: 'Kotlin',
  scala: 'Scala', r: 'R', lua: 'Lua', perl: 'Perl', bash: 'Bash', sh: 'Shell',
  shell: 'Shell', zsh: 'Zsh', powershell: 'PowerShell', ps1: 'PowerShell',
  sql: 'SQL', mysql: 'MySQL', postgresql: 'PostgreSQL', sqlite: 'SQLite',
  html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less', xml: 'XML',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', ini: 'INI',
  md: 'Markdown', markdown: 'Markdown', tex: 'LaTeX', latex: 'LaTeX',
  dockerfile: 'Dockerfile', makefile: 'Makefile', cmake: 'CMake',
  pascal: 'Pascal', pas: 'Pascal', haskell: 'Haskell', hs: 'Haskell',
  erlang: 'Erlang', elixir: 'Elixir', clojure: 'Clojure', lisp: 'Lisp',
  scheme: 'Scheme', ocaml: 'OCaml', fsharp: 'F#', fs: 'F#',
  dart: 'Dart', vue: 'Vue', jsx: 'JSX', tsx: 'TSX', svelte: 'Svelte',
  graphql: 'GraphQL', proto: 'Protobuf', nginx: 'Nginx',
  plaintext: 'Text', text: 'Text', plain: 'Text',
};

function getLanguageLabel(info: string): string {
  if (!info) return '';
  const lang = info.trim().split(/\s+/)[0].toLowerCase();
  return LANG_LABELS[lang] || lang.toUpperCase();
}

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const info = token.info || '';
  const lang = info.trim().split(/\s+/)[0] || '';
  const label = getLanguageLabel(info);
  let highlighted: string;
  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(token.content, { language: lang }).value;
  } else if (lang) {
    highlighted = hljs.highlightAuto(token.content).value;
  } else {
    highlighted = md.utils.escapeHtml(token.content);
  }
  const langAttr = lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : '';
  const labelHtml = label ? `<span class="code-lang-label">${label}</span>` : '';
  return `<div class="code-block-wrapper">${labelHtml}<pre><code${langAttr}>${highlighted}</code></pre></div>\n`;
};

interface MarkdownRendererProps {
  content: any;
  className?: string;
  language?: string;
  pid?: string | number;
}

export function MarkdownRenderer({ content, className, language, pid }: MarkdownRendererProps) {
  const sessionLanguage = useSessionStore((s) => s.language);
  const rawText = extractLocalizedContent(content, language || sessionLanguage);

  const html = useMemo(() => {
    if (!rawText) return '';
    if (rawText.trim().startsWith('<')) return rawText;
    return md.render(rawText);
  }, [rawText]);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !pid) return;

    // Handle PDF inline viewers
    const pdfContainers = ref.current.querySelectorAll('.file-inline-viewer[data-file-ext="pdf"]');
    pdfContainers.forEach((container) => {
      if ((container as any).__fileRendered) return;
      (container as any).__fileRendered = true;
      const filename = container.getAttribute('data-file-src');
      if (!filename) return;
      const url = `/p/${pid}/file/${encodeURIComponent(filename)}?type=additional_file`;
      fetch(url, { redirect: 'follow' })
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          container.innerHTML = `<iframe src="${blobUrl}#toolbar=0&navpanes=0&view=FitH" style="width:100%;height:70vh;border:none;" allowfullscreen></iframe>`;
        })
        .catch(() => {
          container.innerHTML = `<div class="p-4 text-sm text-red-500">Failed to load ${filename}</div>`;
        });
    });

    // Handle DOCX inline viewers
    const docxContainers = ref.current.querySelectorAll('.file-inline-viewer[data-file-ext="docx"]');
    docxContainers.forEach((container) => {
      if ((container as any).__fileRendered) return;
      (container as any).__fileRendered = true;
      const filename = container.getAttribute('data-file-src');
      if (!filename) return;
      const url = `/p/${pid}/file/${encodeURIComponent(filename)}?type=additional_file`;
      container.innerHTML = '<div class="text-sm text-[var(--hydro-text-muted)]">Loading...</div>';
      import('docx-preview').then(({ renderAsync }) =>
        fetch(url, { redirect: 'follow' })
          .then((r) => {
            if (!r.ok) throw new Error(`${r.status}`);
            return r.arrayBuffer();
          })
          .then((buf) => {
            container.innerHTML = '';
            renderAsync(buf, container as HTMLElement, undefined, { className: 'docx-preview' });
          })
      ).catch(() => {
        container.innerHTML = `<div class="p-4 text-sm text-red-500">Failed to load ${filename}</div>`;
      });
    });
  }, [html, pid]);

  if (!html) return null;

  return (
    <Box
      ref={ref}
      className={`hydro-markdown ${className || ''}`}
      p={0}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
