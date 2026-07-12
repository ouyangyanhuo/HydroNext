import { Box } from '@mantine/core';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import delphi from 'highlight.js/lib/languages/delphi';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import haskell from 'highlight.js/lib/languages/haskell';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import latexLanguage from 'highlight.js/lib/languages/latex';
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
import MarkdownIt from 'markdown-it';
import markPlugin from 'markdown-it-mark';
import { useEffect, useMemo, useRef } from 'react';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';
import { markdownXssPlugin } from './markdown-xss';

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
hljs.registerLanguage('latex', latexLanguage);
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
  while (match !== -1) {
    match = state.src.indexOf('$', match);
    if (match === -1) break;
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
  const renderPlaceholder = (source: string, displayMode = false) => displayMode
    ? `<div class="hydro-math hydro-math--block" data-display="true">${escapeHtml(source)}</div>`
    : `<span class="hydro-math" data-display="false">${escapeHtml(source)}</span>`;

  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.math_inline = (tokens, idx) => renderPlaceholder(tokens[idx].content);
  md.renderer.rules.math_block = (tokens, idx) => `${renderPlaceholder(tokens[idx].content, true)}\n`;
}

const MENTION_REGEX = /^@\[\]\(\/user\/(\d+)\)/;
const IMAGE_SIZE_REGEX = /^!\[([^\]]*)\]\((\S+)\s+=(\d+%?)?x(\d+%?)?\)/;
const mentionNameCache = new Map<string, string | null>();

function imageSizePlugin(md: MarkdownIt) {
  md.inline.ruler.before('image', 'image_with_size', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x21) return false;
    const match = IMAGE_SIZE_REGEX.exec(state.src.slice(state.pos));
    if (!match || (!match[3] && !match[4])) return false;
    const src = state.md.normalizeLink(match[2]);
    if (!state.md.validateLink(src)) return false;
    if (!silent) {
      const children: any[] = [];
      state.md.inline.parse(match[1], state.md, state.env, children);
      const token = state.push('image', 'img', 0);
      token.attrSet('src', src);
      token.attrSet('alt', '');
      if (match[3]) token.attrSet('width', match[3]);
      if (match[4]) token.attrSet('height', match[4]);
      token.children = children;
    }
    state.pos += match[0].length;
    return true;
  });
}

function mentionPlugin(md: MarkdownIt) {
  md.inline.ruler.before('link', 'user_mention', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x40) return false;
    const match = MENTION_REGEX.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push('user_mention', 'a', 0);
      token.attrSet('href', `/user/${match[1]}`);
      token.content = match[1];
    }
    state.pos += match[0].length;
    return true;
  });

  md.renderer.rules.user_mention = (tokens, idx) => {
    const uid = tokens[idx].content;
    return `<a class="hydro-mention hydro-mention--loading" href="/user/${uid}" data-user-id="${uid}" title="UID ${uid}">@${uid}</a>`;
  };
}

const EMBED_REGEX = /^@\[([a-zA-Z].+?)\]\((.*?)\)/;
const WEB_URL_REGEX = /^(?:https?:)?\/\//i;
const BILIBILI_ID_REGEX = /^(BV[0-9A-Za-z]{10})$/;
const BILIBILI_URL_REGEX = /(?:bilibili\.com\/video\/|player\.bilibili\.com\/player\.html\?.*?bvid=)(BV[0-9A-Z]{10})/i;

const FILE_ICON_MAP: Record<string, string> = {
  pdf: '📄', doc: '📝', docx: '📝', ppt: '📊', pptx: '📊', xls: '📈', xlsx: '📈',
};

function isWebUrl(url: string) {
  return WEB_URL_REGEX.test(url) || url.startsWith('/');
}

function getBilibiliId(src: string) {
  const direct = BILIBILI_ID_REGEX.exec(src.trim());
  if (direct) return direct[1];
  const fromUrl = BILIBILI_URL_REGEX.exec(src);
  return fromUrl?.[1] || '';
}

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
    const src = tokens[idx].attrGet('src') || '';
    const service = (tokens[idx].attrGet('service') || '').toLowerCase();
    const ext = src.split('.').pop()?.toLowerCase() || service;
    const isFile = src.startsWith('file://') || src.startsWith('./') || src.startsWith('../');
    const displayName = src.replace(/^file:\/\//, '').replace(/^\.\//, '');
    const icon = FILE_ICON_MAP[ext] || FILE_ICON_MAP[service] || '📎';
    const normalizedSrc = md.normalizeLink(src);
    const validExternalUrl = md.validateLink(normalizedSrc);
    const externalLink = validExternalUrl
      ? `<a href="${md.utils.escapeHtml(normalizedSrc)}" target="_blank" rel="noopener noreferrer">${icon} ${md.utils.escapeHtml(displayName)}</a>`
      : `<span class="text-[var(--hydro-text-muted)]">${icon} ${md.utils.escapeHtml(displayName)}</span>`;
    if (service === 'video') {
      if (!validExternalUrl || !isWebUrl(normalizedSrc)) return externalLink;
      const safeSrc = md.utils.escapeHtml(normalizedSrc);
      return `<video class="hydro-markdown-video" controls preload="metadata" src="${safeSrc}">Your browser does not support embedded video.</video>`;
    }
    if (service === 'bilibili') {
      const bvid = getBilibiliId(src);
      if (!bvid) return externalLink;
      return `<div class="hydro-markdown-embed"><iframe src="https://player.bilibili.com/player.html?bvid=${bvid}&amp;autoplay=0" title="Bilibili video ${bvid}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    }
    if (service === 'pdf' || ext === 'pdf') {
      if (isFile) {
        return `<div class="file-inline-viewer my-3 rounded-md border border-[var(--hydro-border)] overflow-hidden" data-file-src="${md.utils.escapeHtml(displayName)}" data-file-ext="pdf"><div class="flex items-center justify-center p-8 text-sm text-[var(--hydro-text-muted)]">${icon} Loading PDF...</div></div>`;
      }
      if (!validExternalUrl) return externalLink;
      return `<iframe src="${md.utils.escapeHtml(normalizedSrc)}" style="width:100%;min-height:70vh;border:none;" allowfullscreen></iframe>`;
    }
    if (['docx', 'doc', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
      if (!isFile) return externalLink;
      return `<div class="file-inline-viewer my-3 rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] p-4" data-file-src="${md.utils.escapeHtml(displayName)}" data-file-ext="${md.utils.escapeHtml(ext)}"><div class="flex items-center gap-2 text-sm text-[var(--hydro-text-muted)]">${icon} Loading ${md.utils.escapeHtml(displayName)}...</div></div>`;
    }
    if (isFile) {
      return `<a href="#" class="file-preview-link hydro-subtle-link inline-flex items-center gap-1 rounded border border-[var(--hydro-border)] bg-[var(--hydro-surface)] px-2 py-1 text-sm font-medium hover:bg-[var(--hydro-surface-muted)]" data-file-src="${md.utils.escapeHtml(displayName)}" data-file-ext="${md.utils.escapeHtml(ext)}">${icon} ${md.utils.escapeHtml(displayName)}</a>`;
    }
    return externalLink;
  };
}

const md = new MarkdownIt({
  linkify: true,
  html: true,
});

md.use(markPlugin);
md.use(imageSizePlugin);
md.use(katexPlugin);
md.use(mentionPlugin);
md.use(fileMediaPlugin);
md.use(markdownXssPlugin);

export function renderMarkdown(content: string): string {
  return md.render(content);
}

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
  const domainId = useSessionStore((s) => s.ui.domainId);
  const rawText = extractLocalizedContent(content, language || sessionLanguage);

  const html = useMemo(() => {
    if (!rawText) return '';
    return renderMarkdown(rawText);
  }, [rawText]);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const mentions = Array.from(root.querySelectorAll<HTMLAnchorElement>('.hydro-mention[data-user-id]'));
    if (!mentions.length) return undefined;
    const cachePrefix = `${domainId}:`;
    const applyName = (element: HTMLAnchorElement, name: string | null) => {
      const uid = element.dataset.userId || '';
      element.textContent = `@${name || uid}`;
      element.title = name ? `@${name} · UID ${uid}` : `UID ${uid}`;
      element.classList.remove('hydro-mention--loading');
    };
    const pendingIds = new Set<number>();
    mentions.forEach((element) => {
      const uid = Number(element.dataset.userId);
      if (!Number.isSafeInteger(uid) || uid <= 0) return;
      const key = `${cachePrefix}${uid}`;
      if (mentionNameCache.has(key)) applyName(element, mentionNameCache.get(key) ?? null);
      else pendingIds.add(uid);
    });
    if (!pendingIds.size) return undefined;

    const controller = new AbortController();
    fetch(`/d/${encodeURIComponent(domainId)}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        args: { ids: Array.from(pendingIds) },
        projection: ['_id', 'uname', 'displayName'],
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((payload) => {
        const users = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
        const resolvedIds = new Set<number>();
        users.forEach((user: any) => {
          const uid = Number(user?._id);
          if (!Number.isSafeInteger(uid)) return;
          const name = String(user.displayName || user.uname || '').trim() || null;
          mentionNameCache.set(`${cachePrefix}${uid}`, name);
          resolvedIds.add(uid);
        });
        pendingIds.forEach((uid) => {
          if (!resolvedIds.has(uid)) mentionNameCache.set(`${cachePrefix}${uid}`, null);
        });
        mentions.forEach((element) => {
          const uid = Number(element.dataset.userId);
          if (Number.isSafeInteger(uid)) applyName(element, mentionNameCache.get(`${cachePrefix}${uid}`) ?? null);
        });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        mentions.forEach((element) => applyName(element, null));
      });

    return () => controller.abort();
  }, [domainId, html]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const elements = Array.from(root.querySelectorAll<HTMLElement>('.hydro-math:not([data-rendered])'));
    if (!elements.length) return undefined;
    let cancelled = false;
    import('katex').then(({ default: katex }) => {
      if (cancelled) return;
      elements.forEach((element) => {
        const source = (element.textContent || '').replace(/\\def\{\\([a-zA-Z0-9]+)\}/g, '\\def\\$1');
        try {
          katex.render(source, element, {
            displayMode: element.dataset.display === 'true',
            output: 'htmlAndMathml',
            strict: 'ignore',
            throwOnError: false,
          });
          element.dataset.rendered = 'true';
        } catch (error: any) {
          element.classList.add('katex-error');
          element.title = String(error?.message || error);
        }
      });
    }).catch((error) => {
      if (cancelled) return;
      elements.forEach((element) => {
        element.classList.add('katex-error');
        element.title = String(error?.message || error);
      });
    });
    return () => { cancelled = true; };
  }, [html]);

  useEffect(() => {
    if (!ref.current || !pid) return undefined;
    let cancelled = false;
    const controllers: AbortController[] = [];
    const blobUrls: string[] = [];
    const setMessage = (container: Element, message: string, isError = false) => {
      const element = document.createElement('div');
      element.className = `p-4 text-sm ${isError ? 'text-red-500' : 'text-[var(--hydro-text-muted)]'}`;
      element.textContent = message;
      container.replaceChildren(element);
    };

    // Handle PDF inline viewers
    const pdfContainers = ref.current.querySelectorAll('.file-inline-viewer[data-file-ext="pdf"]');
    const domainPrefix = window.location.pathname.match(/^(\/d\/[^/]+)/)?.[0] || '';
    pdfContainers.forEach((container) => {
      if ((container as any).__fileRendered) return;
      (container as any).__fileRendered = true;
      const filename = container.getAttribute('data-file-src');
      if (!filename) return;
      const url = `${domainPrefix}/p/${pid}/file/${encodeURIComponent(filename)}?type=additional_file`;
      const controller = new AbortController();
      controllers.push(controller);
      fetch(url, { redirect: 'follow', signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (cancelled) return;
          const blobUrl = URL.createObjectURL(blob);
          blobUrls.push(blobUrl);
          const iframe = document.createElement('iframe');
          iframe.src = `${blobUrl}#toolbar=0&navpanes=0&view=FitH`;
          iframe.style.cssText = 'width:100%;height:70vh;border:none;';
          iframe.setAttribute('allowfullscreen', '');
          container.replaceChildren(iframe);
        })
        .catch((error) => {
          if (!cancelled && error?.name !== 'AbortError') setMessage(container, `Failed to load ${filename}`, true);
        });
    });

    // Handle DOCX inline viewers
    const docxContainers = ref.current.querySelectorAll('.file-inline-viewer[data-file-ext="docx"]');
    docxContainers.forEach((container) => {
      if ((container as any).__fileRendered) return;
      (container as any).__fileRendered = true;
      const filename = container.getAttribute('data-file-src');
      if (!filename) return;
      const url = `${domainPrefix}/p/${pid}/file/${encodeURIComponent(filename)}?type=additional_file`;
      setMessage(container, 'Loading...');
      const controller = new AbortController();
      controllers.push(controller);
      import('docx-preview').then(({ renderAsync }) => (
        fetch(url, { redirect: 'follow', signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`${response.status}`);
            return response.arrayBuffer();
          })
          .then((buf) => {
            if (cancelled) return undefined;
            container.replaceChildren();
            return renderAsync(buf, container as HTMLElement, undefined, { className: 'docx-preview' });
          })
      )).catch((error) => {
        if (!cancelled && error?.name !== 'AbortError') setMessage(container, `Failed to load ${filename}`, true);
      });
    });
    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
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
