import cssfilter from 'cssfilter';
import type MarkdownIt from 'markdown-it';
import xss from 'xss';

const { FilterCSS } = cssfilter as unknown as typeof import('cssfilter');
const { escapeAttrValue, FilterXSS, safeAttrValue } = xss as unknown as typeof import('xss');

const allowedClasses = new Set([
  'columns', 'note', 'row', 'typo', 'warn',
  ...Array.from({ length: 12 }, (_, index) => `medium-${index + 1}`),
]);

const cssFilter = new FilterCSS({
  whiteList: {
    color: true,
    'font-family': true,
    'font-size': true,
    height: true,
    'margin-left': true,
    padding: true,
    position: /relative/,
    'text-align': true,
    'text-indent': true,
    width: true,
  },
});

const commonTags = {
  a: ['target', 'href', 'title'],
  abbr: ['title'],
  address: [],
  aside: [],
  b: [],
  bdi: ['dir'],
  bdo: ['dir'],
  big: [],
  blockquote: ['cite', 'class'],
  br: [],
  caption: [],
  center: [],
  cite: [],
  code: ['class'],
  del: ['datetime'],
  div: ['id', 'class'],
  dl: [],
  em: [],
  font: ['color', 'size', 'face'],
  header: [],
  i: [],
  ins: ['datetime'],
  mark: [],
  ol: [],
  p: ['align', 'style'],
  pre: [],
  s: [],
  small: [],
  span: ['class', 'style'],
  strong: ['id'],
  sub: [],
  sup: [],
  tt: [],
  u: [],
  var: [],
};

const htmlFilter = new FilterXSS({
  whiteList: {
    ...commonTags,
    area: ['shape', 'coords', 'href', 'alt'],
    article: [],
    audio: ['controls', 'loop', 'preload', 'src'],
    col: ['align', 'valign', 'span', 'width'],
    colgroup: ['align', 'valign', 'span', 'width'],
    dd: [],
    details: ['open'],
    dt: [],
    h1: ['id'],
    h2: ['id', 'class'],
    h3: ['id'],
    h4: ['id'],
    h5: ['id'],
    h6: ['id'],
    hr: [],
    img: ['src', 'alt', 'title', 'width', 'height'],
    li: [],
    section: [],
    summary: [],
    table: ['width', 'border', 'align', 'valign'],
    tbody: ['align', 'valign'],
    td: ['width', 'rowspan', 'colspan', 'align', 'valign', 'bgcolor'],
    tfoot: ['align', 'valign'],
    th: ['width', 'rowspan', 'colspan', 'align', 'valign'],
    thead: ['align', 'valign'],
    tr: ['rowspan', 'align', 'valign'],
    ul: [],
    video: ['controls', 'loop', 'preload', 'src', 'height', 'width'],
  },
  css: false,
  allowCommentTag: false,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'semantics'],
  safeAttrValue(tag, name, value) {
    if (name === 'id') return escapeAttrValue(`xss-id-${value}`);
    if (name === 'class') {
      return value
        .split(' ')
        .filter((className) => allowedClasses.has(className) || className.startsWith('language-'))
        .join(' ');
    }
    return safeAttrValue(tag, name, value, cssFilter);
  },
});

export function markdownXssPlugin(md: MarkdownIt) {
  const renderImage = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, index, options, env, renderer) => {
    tokens[index].attrSet('loading', 'lazy');
    tokens[index].attrSet('decoding', 'async');
    return renderImage(tokens, index, options, env, renderer);
  };
  // Apply the same defaults to raw HTML only AFTER sanitizing it. User-supplied
  // loading attributes are not allowlisted, so they cannot duplicate these.
  const sanitize = (content: string) => htmlFilter.process(content)
    .replace(/<img(?=[\s/>])/g, '<img loading="lazy" decoding="async"');
  md.core.ruler.after('linkify', 'xss', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'html_block') token.content = sanitize(token.content);
      if (token.type !== 'inline') continue;
      for (const inlineToken of token.children || []) {
        if (inlineToken.type === 'html_inline') inlineToken.content = sanitize(inlineToken.content);
      }
    }
  });
}
