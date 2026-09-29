import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { after, test } from 'node:test';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as any)[key];
    }
});
const { act, createElement: h, createRef } = require('react');
const { createRoot } = require('react-dom/client');
const { MantineProvider } = require('@mantine/core');
const path = fileURLToPath(new URL('../src/components/common/button.tsx', import.meta.url));
const built = buildSync({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const module = { exports: {} as any };
runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require });
const { Button, ActionIcon, UnstyledButton, ButtonBase } = module.exports;

async function mount(element: any, theme = 'light') {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(MantineProvider, { forceColorScheme: theme }, element)));
    return {
        host,
        async close() {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

test('button wrappers preserve explicit dimensions, semantic color, class overrides and refs', async () => {
    const ref = createRef();
    let clicks = 0;
    const view = await mount(h(Button, {
        ref, size: 'xs', color: 'red', variant: 'outline', className: 'custom',
        w: 120, onClick: () => { clicks++; }, 'aria-label': 'Delete',
    }, 'Delete'));
    try {
        const button = view.host.querySelector('button')!;
        assert.equal(ref.current, button);
        assert.ok(button.classList.contains('hydro-button-feedback'));
        assert.ok(button.classList.contains('custom'));
        assert.equal(button.getAttribute('data-size'), 'xs');
        assert.equal(button.getAttribute('data-variant'), 'outline');
        assert.match(button.getAttribute('style') || '', /red/);
        await act(async () => button.click());
        assert.equal(clicks, 1);
    } finally { await view.close(); }
});

test('disabled and loading buttons do not invoke submit handlers', async () => {
    let clicks = 0;
    const view = await mount(h('div', {},
        h(Button, { disabled: true, onClick: () => { clicks++; } }, 'Disabled'),
        h(Button, { loading: true, onClick: () => { clicks++; } }, 'Loading')));
    try {
        await act(async () => {
            for (const button of view.host.querySelectorAll('button')) button.click();
        });
        assert.equal(clicks, 0);
        assert.ok(view.host.querySelector('[data-loading]'));
    } finally { await view.close(); }
});

test('polymorphic links, icon labels and native form submission semantics survive migration', async () => {
    const linkRef = createRef();
    const view = await mount(h('div', {},
        h(Button, { component: 'a', href: '/d/team/p?page=3', ref: linkRef }, 'Problems'),
        h(ActionIcon, { 'aria-label': 'Settings', size: 'input-xs' }, h('svg')),
        h(UnstyledButton, { 'aria-pressed': true }, 'Selected'),
        h(ButtonBase, { type: 'submit', form: 'editor' }, 'Submit')), 'dark');
    try {
        assert.equal(linkRef.current?.getAttribute('href'), '/d/team/p?page=3');
        assert.equal(view.host.querySelector('[aria-label="Settings"]')?.classList.contains('hydro-icon-button'), true);
        assert.equal(view.host.querySelector('[aria-pressed="true"]')?.classList.contains('hydro-button-base'), true);
        assert.equal(view.host.querySelector('[form="editor"]')?.getAttribute('type'), 'submit');
    } finally { await view.close(); }
});

test('interaction stylesheet has hover/press/focus states but no control sizing or gradients', () => {
    const css = postcss.parse(readFileSync(new URL('../src/styles/button.css', import.meta.url), 'utf8'));
    const selectors: string[] = [];
    css.walkRules((rule) => { selectors.push(rule.selector); });
    assert.ok(selectors.some((selector) => selector.includes(':hover') && selector.includes('[data-loading]')));
    assert.ok(selectors.some((selector) => selector.includes(':active')));
    assert.ok(selectors.some((selector) => selector.includes(':focus-visible')));
    css.walkDecls((declaration) => {
        assert.ok(!['height', 'width', 'font-size', 'padding'].includes(declaration.prop));
        assert.doesNotMatch(declaration.value, /gradient/);
    });
    let reducedMotion = false;
    css.walkAtRules('media', (rule) => {
        if (rule.params !== '(prefers-reduced-motion: reduce)') return;
        rule.walkDecls('scale', (declaration) => { reducedMotion = declaration.value === 'none' && declaration.important; });
    });
    assert.equal(reducedMotion, true);
});

test('all app-authored buttons use the common wrappers', () => {
    const root = fileURLToPath(new URL('../src/', import.meta.url));
    function visit(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const file = join(dir, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (file.endsWith('.tsx') && file !== path) {
                const source = readFileSync(file, 'utf8');
                assert.doesNotMatch(source, /<button\b/, file);
                const imports = source.match(/import\s*\{[^}]+\}\s*from\s*['"]@mantine\/core['"]/g) || [];
                for (const declaration of imports) assert.doesNotMatch(declaration, /\b(?:Button|ActionIcon|UnstyledButton)\b/, file);
            }
        }
    }
    visit(root);
});
