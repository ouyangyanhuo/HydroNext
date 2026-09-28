/* eslint-disable no-await-in-loop -- DOM cases must run sequentially in the shared test document. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { after, test } from 'node:test';
import { mergeSelectClasses, shortSelectDimension } from '../src/components/common/select-styles.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
const globals = {
    window: dom.window,
    document: dom.window.document,
    Document: dom.window.Document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    ShadowRoot: dom.window.ShadowRoot,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
};
for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as any)[key];
    }
});

const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MantineProvider } = require('@mantine/core');
const componentEntry = fileURLToPath(new URL('../src/components/common/select.tsx', import.meta.url));
const built = buildSync({ entryPoints: [componentEntry], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const module = { exports: {} as any };
runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require });
const { ShortSelect, LongSelect, TagMultiSelect } = module.exports;

test('three variants expose independent defaults and allow searchable short controls', () => {
    assert.equal(ShortSelect.render({}, null).props.size, 'xs');
    assert.equal(ShortSelect.render({ size: 'sm' }, null).props.size, 'sm');
    assert.equal(ShortSelect.render({}, null).props.searchable, false);
    assert.equal(ShortSelect.render({ searchable: true }, null).props.searchable, true);
    assert.equal(LongSelect.render({}, null).props.searchable, true);
    assert.equal(LongSelect.render({ searchable: false }, null).props.searchable, false);
    assert.equal(TagMultiSelect.render({}, null).props.searchable, true);
});

test('short dimensions are customizable and clamped, with safe invalid-value handling', () => {
    assert.equal(shortSelectDimension(200, 'width'), 200);
    assert.equal(shortSelectDimension(900, 'width'), 320);
    assert.equal(shortSelectDimension(-1, 'width'), 72);
    assert.equal(shortSelectDimension(36, 'height'), 36);
    assert.equal(shortSelectDimension(100, 'height'), 48);
    assert.equal(shortSelectDimension(0, 'height'), 24);
    assert.equal(shortSelectDimension(Number.NaN, 'height'), undefined);
    assert.equal(shortSelectDimension(Infinity, 'width'), undefined);
    const props = ShortSelect.render({ width: 500, height: 100 }, null).props;
    assert.equal(props.w, 320);
    assert.equal(props.style[0]['--hydro-short-height'], '48px');
    assert.equal(ShortSelect.render({ w: 80 }, null).props.w, 80);
});

test('callbacks, refs, controlled values, option renderers and portal configuration survive wrapping', () => {
    for (const Component of [ShortSelect, LongSelect, TagMultiSelect]) {
        const onChange = () => {};
        const onSearchChange = () => {};
        const renderOption = () => 'custom';
        const ref = { current: null };
        const props = Component.render({
            onChange, onSearchChange, renderOption, disabled: true, clearable: true,
            value: null, className: 'custom', comboboxProps: { withinPortal: false, zIndex: 900 },
        }, ref).props;
        assert.equal(props.onChange, onChange);
        assert.equal(props.onSearchChange, onSearchChange);
        assert.equal(props.renderOption, renderOption);
        assert.equal(props.ref, ref);
        assert.equal(props.value, null);
        assert.equal(props.disabled, true);
        assert.equal(props.clearable, true);
        assert.equal(props.comboboxProps.withinPortal, false);
        assert.equal(props.comboboxProps.zIndex, 900);
        assert.match(props.className, /custom/);
    }
});

test('shared styles merge with object and callback overrides without mutating callers', () => {
    const custom = { input: 'custom-input', label: 'custom-label' };
    assert.deepEqual(mergeSelectClasses({ input: 'base' }, custom), { input: 'base custom-input', label: 'custom-label' });
    assert.equal(custom.input, 'custom-input');
    for (const classNames of [custom, () => custom]) {
        for (const Component of [ShortSelect, LongSelect, TagMultiSelect]) {
            const resolved = Component.render({ classNames }, null).props.classNames({}, {}, {});
            assert.equal(resolved.input, 'hydro-select__input custom-input');
            assert.equal(resolved.label, 'custom-label');
            assert.equal(resolved.dropdown, 'hydro-select__dropdown');
        }
    }
});

async function mount(Component: any, props: any, theme = 'light') {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(MantineProvider, { forceColorScheme: theme }, h(Component, props))));
    return {
        host,
        async close() {
            try {
                await act(async () => root.unmount());
            } catch (error) {
                if (error instanceof AggregateError) throw new Error(error.errors.map((item) => item.stack || item).join('\n'));
                throw error;
            }
            host.remove();
        },
    };
}

test('short select opens portalled options and changes selection in light and dark themes', async () => {
    for (const theme of ['light', 'dark']) {
        let selected = '';
        const view = await mount(ShortSelect, {
            label: 'Order', data: ['Ascending', 'Descending'], onChange: (value: string) => { selected = value; },
        }, theme);
        try {
            const input = view.host.querySelector('input[aria-haspopup="listbox"]') as HTMLInputElement;
            assert.ok(input);
            await act(async () => input.click());
            const option = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent === 'Descending') as HTMLElement;
            assert.ok(option);
            assert.ok(option.closest('.hydro-select__dropdown'));
            await act(async () => option.click());
            assert.equal(selected, 'Descending');
        } finally {
            await view.close();
        }
    }
});

test('long select filters options and supports clearing', async () => {
    let selected: string | null = 'Alpha';
    const view = await mount(LongSelect, {
        label: 'Language', data: ['Alpha', 'Beta'], defaultValue: 'Alpha', clearable: true,
        clearButtonProps: { 'aria-label': 'Clear selection' }, onChange: (value: string | null) => { selected = value; },
    });
    try {
        await act(async () => (view.host.querySelector('[aria-label="Clear selection"]') as HTMLElement).click());
        assert.equal(selected, null);
        const input = view.host.querySelector('input[aria-haspopup="listbox"]') as HTMLInputElement;
        await act(async () => {
            input.focus();
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Bet');
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        assert.deepEqual([...document.querySelectorAll('[role="option"]')].map((item) => item.textContent), ['Beta']);
    } finally {
        await view.close();
    }
});

test('multi select retains selections as pills and emits an array', async () => {
    let selected: string[] = [];
    const view = await mount(TagMultiSelect, {
        label: 'Problems', data: ['P1', 'P2'], defaultValue: ['P1'], onChange: (value: string[]) => { selected = value; },
    });
    try {
        assert.match(view.host.textContent || '', /P1/);
        const input = view.host.querySelector('input[aria-haspopup="listbox"]') as HTMLInputElement;
        await act(async () => input.click());
        const option = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent === 'P2') as HTMLElement;
        await act(async () => option.click());
        assert.deepEqual(selected, ['P1', 'P2']);
        assert.equal(view.host.querySelectorAll('.mantine-Pill-root').length, 2);
    } finally {
        await view.close();
    }
});

test('pages only use shared variants, not direct Mantine or native selects', () => {
    const root = fileURLToPath(new URL('../src/', import.meta.url));
    function visit(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (path.endsWith('.tsx') && path !== join(dirname(root), 'src/components/common/select.tsx')) {
                assert.doesNotMatch(readFileSync(path, 'utf8'), /<(?:Select|MultiSelect|select)\b/, path);
            }
        }
    }
    visit(root);
});
