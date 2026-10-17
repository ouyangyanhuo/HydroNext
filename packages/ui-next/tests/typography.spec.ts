import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const readStyle = (name: string) => readFileSync(new URL(`../src/styles/${name}`, import.meta.url), 'utf8');

function tokensFor(selector: string) {
    const tokens = new Map<string, string>();
    postcss.parse(readStyle('tokens.css')).walkRules((rule) => {
        if (rule.selector === selector) rule.walkDecls((declaration) => { tokens.set(declaration.prop, declaration.value); });
    });
    return tokens;
}

test('dark medium weights are reduced while light, regular and bold weights are preserved', () => {
    const base = tokensFor(':root');
    const dark = new Map([...base, ...tokensFor("[data-mantine-color-scheme='dark']")]);
    for (const [tokens, medium, semibold] of [[base, '500', '600'], [dark, '460', '560']] as const) {
        assert.equal(tokens.get('--hydro-weight-medium'), medium);
        assert.equal(tokens.get('--hydro-weight-semibold'), semibold);
        assert.equal(tokens.get('--hydro-weight-regular'), '400');
        assert.equal(tokens.get('--hydro-weight-bold'), '700');
        assert.equal(tokens.get('--hydro-font-family'), 'var(--hydro-font-serif)');
        assert.match(tokens.get('--hydro-font-serif')!, /Georgia, serif$/);
        assert.match(tokens.get('--hydro-font-mono')!, /monospace$/);
    }
});

test('Tailwind utilities and both Mantine theme factories use the semantic weights', () => {
    const source = postcss.parse(readStyle('tailwind.css'));
    const weights = new Map<string, string>();
    source.walkAtRules('theme', (rule) => {
        assert.equal(rule.params, 'inline');
        rule.walkDecls((declaration) => { weights.set(declaration.prop, declaration.value); });
    });
    assert.equal(weights.get('--font-weight-medium'), 'var(--hydro-weight-medium)');
    assert.equal(weights.get('--font-weight-semibold'), 'var(--hydro-weight-semibold)');
    const entry = fileURLToPath(new URL('../src/styles/mantine-theme.ts', import.meta.url));
    const built = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
    const module = { exports: {} as any };
    runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require });
    const { theme, createDynamicTheme } = module.exports;
    for (const current of [theme, createDynamicTheme('#336699').theme]) {
        assert.equal(current.components.Button.defaultProps.fw, 'var(--hydro-weight-semibold)');
        assert.equal(current.components.Button.defaultProps.size, 'sm');
        assert.equal(current.headings.fontWeight, '700');
        const { createElement: h } = require('react');
        const { renderToStaticMarkup } = require('react-dom/server');
        const { MantineProvider, Button } = require('@mantine/core');
        const html = renderToStaticMarkup(h(MantineProvider, { theme: current }, h('div', {},
            h(Button, { id: 'default' }, 'Default'), h(Button, { id: 'override', fw: 700 }, 'Override'))));
        const dom = new JSDOM(html);
        try {
            assert.equal(dom.window.document.querySelector('#default').style.fontWeight, 'var(--hydro-weight-semibold)');
            assert.equal(dom.window.document.querySelector('#override').style.fontWeight, '700');
        } finally { dom.window.close(); }
    }
});

test('native wrapping targets prose and headings but excludes technical and table content', () => {
    const dom = new JSDOM(`<div class="hydro-markdown">
        <h2 id="heading">A longer heading</h2><p id="prose">正文末行更自然。</p>
        <ul><li id="item">A list item</li></ul>
        <pre><code><p id="code" class="mantine-Text-root">a + b</p></code></pre>
        <table><tr><td><p id="cell" class="mantine-Text-root">123</p></td></tr></table>
        <div class="katex"><p id="math" class="mantine-Text-root">x</p></div>
        <div class="monaco-editor"><p id="editor" class="mantine-Text-root">source</p></div>
    </div><p id="description" class="mantine-Text-root">A longer description</p>
    <button id="control">Submit</button><input id="input"><textarea id="textarea">input</textarea>`);
    try {
        const document = dom.window.document;
        const before = document.body.innerHTML;
        const targets = new Map<string, string[]>();
        postcss.parse(readStyle('typography.css')).walkRules((rule) => {
            const value = rule.nodes.find((node) => node.type === 'decl' && node.prop === 'text-wrap');
            assert.ok(value?.type === 'decl');
            targets.set(value.value, [...document.querySelectorAll(rule.selector)].map((element) => element.id).filter(Boolean));
            rule.walkDecls((declaration) => {
                assert.equal(declaration.prop, 'text-wrap');
                assert.equal(declaration.important, undefined);
            });
        });
        assert.deepEqual(targets.get('pretty'), ['prose', 'item', 'description']);
        assert.deepEqual(targets.get('balance'), ['heading']);
        assert.equal(document.body.innerHTML, before);
    } finally { dom.window.close(); }
});
