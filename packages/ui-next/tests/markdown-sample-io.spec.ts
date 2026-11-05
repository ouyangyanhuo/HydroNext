import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import MarkdownIt from 'markdown-it';
import { test } from 'node:test';
import postcss from 'postcss';
import { attachCodeCopyButtons } from '../src/components/markdown/code-copy.ts';
import { markdownXssPlugin } from '../src/components/markdown/markdown-xss.ts';
import { sampleIOPlugin } from '../src/components/markdown/sample-io.ts';
import { tableCompatibilityPlugin } from '../src/components/markdown/table-compat.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const sample = [
    '@[SampleIO-Start]', '## 样例输入', '', '```text', 'abbcccaa', '```', '',
    '## 样例输出', '', '```text', '3', '```', '@[SampleIO-End]',
].join('\n');
const md = new MarkdownIt({ html: true }).use(sampleIOPlugin).use(markdownXssPlugin);
const original = new MarkdownIt({ html: true }).use(markdownXssPlugin);

// Exercise the actual shared renderer as well as the plugin in isolation.
const renderer = { exports: {} as any };
const mocks: Record<string, any> = {
    './code-copy': { attachCodeCopyButtons }, './markdown-xss': { markdownXssPlugin },
    './sample-io': { sampleIOPlugin }, './table-compat': { tableCompatibilityPlugin },
};
runInNewContext(transformSync(readFileSync(new URL('../src/components/markdown/markdown-renderer.tsx', import.meta.url), 'utf8'),
    { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module: renderer, exports: renderer.exports,
    require: (name: string) => mocks[name] || (name.startsWith('@/') || name.startsWith('@mantine/') ? {} : require(name)),
});
const { renderMarkdown } = renderer.exports;

test('the shared renderer groups sample titles and code, keeps following content, and preserves existing copy enhancement', async () => {
    const dom = new JSDOM(`<div class="hydro-markdown">${renderMarkdown(`${sample}\n\nAfter\n\n${sample}`)}</div>`);
    try {
        const root = dom.window.document.querySelector('.hydro-markdown');
        const groups = root.querySelectorAll('.hydro-sample-io');
        assert.equal(groups.length, 2);
        const columns = groups[0].querySelectorAll('.hydro-sample-io__column');
        assert.deepEqual([...columns].map((column) => column.firstElementChild.textContent), ['样例输入', '样例输出']);
        assert.deepEqual([...columns].map((column) => column.querySelector('pre code').textContent), ['abbcccaa\n', '3\n']);
        assert.ok([...columns].every((column) => column.querySelector('.hydro-sample-io__body > .code-block-wrapper > pre')));
        assert.equal(groups[0].nextElementSibling.textContent, 'After');
        assert.doesNotMatch(root.textContent, /@\[SampleIO/);
        assert.equal(root.querySelectorAll('button').length, 0, 'the shortcode does not enable copy for non-editors');
        let copied = '';
        Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (text: string) => { copied = text; } } });
        const cleanup = attachCodeCopyButtons(root, { copy: 'Copy', copied: 'Copied' }, () => assert.fail('copy failed'));
        try {
            assert.equal(root.querySelectorAll('button').length, 4);
            columns[0].querySelector('button').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
            assert.equal(copied, 'abbcccaa\n', 'copy excludes the heading and language badge');
        } finally { cleanup(); }
        const maps = (parser: MarkdownIt) => parser.parse(sample, {}).filter((token) => token.type === 'fence').map((token) => token.map);
        assert.deepEqual(maps(md), maps(original), 'shortcode transformation preserves original code source locations');
    } finally { dom.window.close(); }
});

test('sample markers respect code/HTML boundaries and malformed groups do not hide or capture unrelated content', () => {
    const unchanged = [
        `\`\`\`markdown\n${sample}\n\`\`\``,
        sample.split('\n').map((line) => `    ${line}`).join('\n'),
        '`@[SampleIO-Start]` and `@[SampleIO-End]`',
        `<div>\n${sample}\n</div>`,
        '\\@[SampleIO-Start]\n\nEscaped\n\n\\@[SampleIO-End]',
    ];
    for (const source of unchanged) assert.equal(md.render(source), original.render(source));
    const invalid = [
        sample.replace('@[SampleIO-End]', ''), sample.replace('@[SampleIO-Start]', ''),
        '@[SampleIO-Start]\n## Only one\n\nBody\n@[SampleIO-End]\n\nAfter',
        '> @[SampleIO-Start]\n> ## Input\n> A\n\n## Output\nB\n@[SampleIO-End]\n\nAfter',
        '> @[SampleIO-Start]\n\nSeparate quote\n\n> @[SampleIO-End]',
        `@[SampleIO-Start]\n${sample}\n@[SampleIO-End]`,
    ];
    for (const source of invalid) {
        const html = md.render(source);
        assert.doesNotMatch(html, /class="hydro-sample-io"/);
        assert.match(html, /@\[SampleIO-(?:Start|End)\]/);
        if (source.endsWith('After')) assert.match(html, /<p>After<\/p>/);
    }
    for (const [source, selector] of [
        [`> ${sample.split('\n').join('\n> ')}\n\nAfter`, 'blockquote > .hydro-sample-io'],
        [`- ${sample.split('\n').join('\n  ')}\n\nAfter`, 'li > .hydro-sample-io'],
        [sample.replace('abbcccaa', '@[SampleIO-End]\nabbcccaa'), '.hydro-sample-io'],
    ]) {
        const nested = new JSDOM(md.render(source));
        try {
            assert.equal(nested.window.document.querySelectorAll(selector).length, 1);
            if (source.endsWith('After')) assert.equal(nested.window.document.body.lastElementChild.textContent, 'After');
            else assert.match(nested.window.document.querySelector('code').textContent, /@\[SampleIO-End\]/);
        } finally { nested.window.close(); }
    }
    assert.equal(md.render('## Input\n\n```text\na\n```\n\n## Output\n\n```text\nb\n```'),
        original.render('## Input\n\n```text\na\n```\n\n## Output\n\n```text\nb\n```'));
});

test('sample content keeps normal Markdown features and sanitization, with width-aware grid and scrollable code styles', () => {
    const source = sample.replace('## 样例输入', '## **样例输入** <img src="x" onerror="alert(1)">')
        .replace('## 样例输出', '## 样例输出\n\n<script>alert(2)</script>\n\n$1+2$\n\n==Result==');
    const html = renderMarkdown(source);
    assert.match(html, /class="hydro-sample-io"/);
    assert.match(html, /<strong>样例输入<\/strong>/);
    assert.match(html, /<mark>Result<\/mark>/);
    assert.match(html, /class="hydro-math"/);
    assert.doesNotMatch(html, /onerror|<script|alert\(2\)/);
    const rules = new Map<string, Map<string, string>>();
    const queries: string[] = [];
    const css = postcss.parse(readFileSync(new URL('../src/styles/markdown.css', import.meta.url), 'utf8'));
    css.walkRules((rule) => {
        const declarations = new Map<string, string>();
        rule.walkDecls((declaration) => { declarations.set(declaration.prop, declaration.value); });
        if (rule.parent?.type === 'root') rules.set(rule.selector, declarations);
    });
    css.walkAtRules('container', (rule) => { queries.push(rule.params); });
    assert.equal(rules.get('.hydro-markdown .hydro-sample-io__grid')!.get('grid-template-columns'), 'repeat(2, minmax(0, 1fr))');
    assert.equal(rules.get('.hydro-markdown .hydro-sample-io__column')!.get('min-inline-size'), '0');
    assert.ok(queries.includes('hydro-sample-io (max-width: 28rem)'), 'the editor sidebar responds to its container, not only the viewport');
    assert.equal(rules.get('.hydro-markdown pre')!.get('overflow'), 'auto');
    assert.equal(rules.get('.hydro-markdown .hydro-sample-io__body pre')!.get('margin-inline'), '0');
});
