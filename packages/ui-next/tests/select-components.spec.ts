/* eslint-disable no-await-in-loop -- DOM cases must run sequentially in the shared test document. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync, transformSync } from 'esbuild';
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
    HTMLInputElement: dom.window.HTMLInputElement,
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

test('contest problem drag order is saved in the current domain without reloading labels', async () => {
    const pageModule = { exports: {} as any };
    const args = { tdoc: { docId: 'contest1', title: 'Contest', pids: [1, 2, 3], maintainer: [9] } };
    const requests: { url: string, body: any }[] = [];
    let finishSave: (() => void) | undefined;
    const core = require('@mantine/core');
    const mocks: Record<string, any> = {
        '@mantine/notifications': { notifications: { show() {} } },
        '@/components/common/select': { LongSelect, TagMultiSelect },
        '@/components/common/button': { Button: core.Button },
        '@/components/common/data-table': { DataTable: () => null },
        '@/components/common/page-header': { PageHeader: ({ children }: any) => h('header', {}, children) },
        '@/components/editor/markdown-editor': { MarkdownEditor: () => null },
        '@/components/user/framed-avatar': { FramedAvatar: () => null },
        '@/context/page-data': { usePageData: () => ({ args }) },
        '@/context/router': { useNavigate: () => () => {} },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/d/team/contest' },
        '@/hooks/use-domain': { useDomainId: () => 'team' },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/utils/error': { formatErrorMessage: () => 'Save failed' },
        '@/utils/lang-display': { LANG_DISPLAY: { cpp: 'C++' }, getLangDisplay: (key: string) => key },
        '@/utils/user-name': { formatUserName: (user: any) => user.uname },
    };
    const source = readFileSync(new URL('../src/pages/contest_edit.tsx', import.meta.url), 'utf8');
    runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
        module: pageModule, exports: pageModule.exports, window: dom.window,
        require: (name: string) => mocks[name] || require(name),
        fetch: async (url: string, options: any) => {
            requests.push({ url, body: JSON.parse(options.body) });
            if (url.endsWith('/api/problems')) {
                return { ok: true, json: async () => [1, 2, 3].map((id) => ({ docId: id, title: `Problem ${id}` })) };
            }
            if (url.endsWith('/api/users')) return { ok: true, json: async () => [{ _id: 9, uname: 'Maintainer' }] };
            await new Promise<void>((resolve) => { finishSave = resolve; });
            return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}) };
        },
    });
    dom.reconfigure({ url: 'https://oj.example/d/team/contest/contest1/edit' });
    const view = await mount(pageModule.exports.default, {});
    const pills = () => [...view.host.querySelectorAll('.hydro-contest-problems [data-mantine-pill-index]')] as HTMLElement[];
    const labels = () => pills().map((pill) => pill.querySelector('.mantine-Pill-label')?.textContent);
    const transfer = { effectAllowed: '', dropEffect: '', setData() {}, setDragImage() {} };
    function drag(element: HTMLElement, type: string) {
        const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 90 });
        Object.defineProperty(event, 'dataTransfer', { value: transfer });
        element.dispatchEvent(event);
    }
    try {
        assert.deepEqual(labels(), ['Problem 1', 'Problem 2', 'Problem 3']);
        assert.equal(view.host.querySelectorAll('[draggable="true"]').length, 3, 'maintainers are not draggable');
        const [first, , third] = pills();
        third.getBoundingClientRect = () => ({ left: 0, width: 100 } as DOMRect);
        await act(async () => {
            drag(first, 'dragstart');
            drag(third, 'dragover');
            assert.equal(third.getAttribute('data-drag-over'), 'after');
            drag(third, 'drop');
        });
        assert.deepEqual(labels(), ['Problem 2', 'Problem 3', 'Problem 1']);
        assert.equal(requests.filter((request) => request.url.endsWith('/api/problems')).length, 1);
        await act(async () => pills()[2].dispatchEvent(new dom.window.KeyboardEvent('keydown', {
            key: 'ArrowLeft', altKey: true, bubbles: true,
        })));
        assert.deepEqual(labels(), ['Problem 2', 'Problem 1', 'Problem 3']);
        const update = [...view.host.querySelectorAll('button')].find((button) => button.textContent === 'Update');
        assert.ok(update);
        await act(async () => update.click());
        const save = requests.find((request) => request.body.operation === 'update');
        assert.equal(save?.url, 'https://oj.example/d/team/contest/contest1/edit');
        assert.equal(save?.body.pids, '2,1,3');
        assert.equal(view.host.querySelectorAll('.hydro-contest-problems [draggable="true"]').length, 0);
        await act(async () => finishSave?.());
    } finally {
        await act(async () => finishSave?.());
        await view.close();
        dom.reconfigure({ url: 'http://localhost/' });
    }
});

test('pages use shared variants except the independently styled paginator', () => {
    const root = fileURLToPath(new URL('../src/', import.meta.url));
    function visit(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (path.endsWith('.tsx') && !['select.tsx', 'paginator.tsx'].some((name) => path === join(root, 'components/common', name))) {
                assert.doesNotMatch(readFileSync(path, 'utf8'), /<(?:Select|MultiSelect|select)\b/, path);
            }
        }
    }
    visit(root);
});

test('paginator retains its dedicated small select and named font size', async () => {
    const source = readFileSync(new URL('../src/components/common/paginator.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /ShortSelect/);
    assert.match(source, /<Select[\s\S]*?size="xs"[\s\S]*?w=\{76\}/);
    assert.match(source, /<Pagination[\s\S]*?size="sm"/);
    const view = await mount(require('@mantine/core').Pagination, { size: 'sm', total: 5 });
    try {
        const pagination = view.host.querySelector('.mantine-Pagination-root') as HTMLElement;
        assert.equal(pagination.style.getPropertyValue('--pagination-control-fz'), 'var(--mantine-font-size-sm)');
        assert.equal(pagination.style.getPropertyValue('--pagination-control-size'), 'var(--pagination-control-size-sm)');
    } finally {
        await view.close();
    }
});
