import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { recordFilterOptions, searchRecordFilterOptions } from '../src/utils/record-filter-options.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const React = require('react');
const { act, createElement: h, useState } = React;
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/team/record', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Document: dom.window.Document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot,
    HTMLInputElement: dom.window.HTMLInputElement, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const { createRoot } = require('react-dom/client');
const { MantineProvider } = require('@mantine/core');
after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

function load(path: string, mocks: Record<string, any> = {}) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, AbortController, URL, URLSearchParams,
        require: (name: string) => mocks[name] || require(name),
    });
    return module.exports;
}
const selectStyles = load('../src/components/common/select-styles.ts');
const selects = load('../src/components/common/select.tsx', { './select-styles': selectStyles });
const notices: any[] = [];
const translate = (key: string) => key;
const { RecordFilterSelect } = load('../src/components/record/record-filter-select.tsx', {
    '@/components/common/select': selects,
    '@/hooks/use-i18n': { useI18n: () => ({ t: translate }) },
    '@/utils/error': { formatErrorMessage: (error: any, fallback: string) => error?.message || fallback },
    '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
});
const flushSearch = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 280)); });
async function enter(input: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
}

test('all filter lookups use the scoped permission endpoint, including exact hydration and contest context', async () => {
    const original = globalThis.fetch;
    const calls: any[] = [];
    const answers: any[] = [
        { documents: [{ _id: 7, uname: 'alice', displayName: '小明' }] },
        { documents: [{ docId: 12, pid: 'P1012', title: 'A+B' }] },
        { documents: [{ docId: '6aeabd86888939840db7a9ed', title: 'Exam' }] },
        { documents: [{ docId: '6aeabd86888939840db7a9ed', title: 'Exam' }] },
        { documents: [{ _id: 7, uname: 'alice', displayName: '小明' }] },
    ];
    globalThis.fetch = (async (url: any, init: any) => {
        calls.push({ url, init });
        return { ok: true, json: async () => answers.shift() };
    }) as any;
    const buildUrl = (name: string, params: any = {}, query: any = {}) => {
        assert.equal(name, 'record_filter_options');
        assert.equal(params.domainId, 'team');
        return `/d/team/record/filter-options?${new URLSearchParams(query)}`;
    };
    const controller = new AbortController();
    try {
        const users = await searchRecordFilterOptions('user', 'ali', 'team', buildUrl, controller.signal);
        assert.deepEqual(users, [{ value: '7', label: '小明 (alice) · UID 7' }]);
        assert.match(calls[0].url, /^\/d\/team\/record\/filter-options\?kind=user/);
        assert.equal(calls[0].init.body, undefined, 'read-only search must not use a broad user API');
        const problems = await searchRecordFilterOptions('problem', 'A+B', 'team', buildUrl, controller.signal, 'contest-context');
        assert.deepEqual(problems, [{ value: '12', label: 'P1012 · A+B' }]);
        assert.equal(new URL(calls[1].url, dom.window.location.origin).searchParams.get('q'), 'A+B');
        assert.equal(new URL(calls[1].url, dom.window.location.origin).searchParams.get('tid'), 'contest-context');
        await searchRecordFilterOptions('contest', 'Exam', 'team', buildUrl, controller.signal);
        const contests = await searchRecordFilterOptions('contest', '6aeabd86888939840db7a9ed', 'team', buildUrl,
            controller.signal, 'unused-context', true);
        assert.equal(contests[0].value, '6aeabd86888939840db7a9ed');
        assert.equal(contests[0].label, 'Exam', 'contest IDs must not appear in the displayed label');
        assert.equal(recordFilterOptions('contest', [{ docId: '6aeabd86888939840db7a9ed' }])[0].label, '—');
        const exact = new URL(calls[3].url, dom.window.location.origin);
        assert.equal(exact.searchParams.get('exact'), 'true');
        assert.equal(exact.searchParams.get('tid'), null, 'contest search must not inherit another contest as its context');
        const initialUsers = await searchRecordFilterOptions('user', '', 'team', buildUrl, controller.signal);
        assert.deepEqual(initialUsers, users, 'opening the user filter must request permission-scoped suggestions without a keyword');
        assert.equal(new URL(calls[4].url, dom.window.location.origin).searchParams.get('q'), '');
        for (const call of calls) {
            assert.equal(call.init.signal, controller.signal);
            assert.equal(call.init.cache, 'no-store');
            assert.equal(call.init.redirect, 'error');
        }
        assert.equal(recordFilterOptions('problem', [{ docId: 1 }, { docId: 1 }]).length, 1);
    } finally { globalThis.fetch = original; }
});

test('missing backend routes and wrong response shapes fail explicitly instead of reporting no results', async () => {
    const original = globalThis.fetch;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let requests = 0;
    globalThis.fetch = (async () => {
        requests++;
        return { ok: true, json: async () => ({ rdocs: [], pdict: {} }) };
    }) as any;
    try {
        const signal = new AbortController().signal;
        await assert.rejects(searchRecordFilterOptions('problem', 'A+B', 'team', () => '#', signal), /restart the backend/);
        assert.equal(requests, 0, 'an unknown route must never request the current page');
        await assert.rejects(searchRecordFilterOptions('contest', 'Exam', 'team', () => '/record/filter-options', signal),
            /restart the backend/);
        globalThis.fetch = (async () => ({ ok: true, json: async () => ({ documents: [] }) })) as any;
        assert.deepEqual(await searchRecordFilterOptions('problem', 'hidden', 'team', () => '/record/filter-options', signal), []);
        const loadOptions = (query: string, abort: AbortSignal) => searchRecordFilterOptions('problem', query, 'team', () => '#', abort);
        await act(async () => root.render(h(MantineProvider, { env: 'test' },
            h(RecordFilterSelect, { label: 'Problem', value: '', loadOptions, onChange() {} }))));
        await act(async () => host.querySelector<HTMLInputElement>('input:not([type="hidden"])')!.focus());
        await flushSearch();
        assert.match(document.body.textContent || '', /restart the backend/);
        assert.ok(!(document.body.textContent || '').includes('No results'), 'transport/configuration failures are not empty results');
    } finally {
        await act(async () => root.unmount()); host.remove();
        notices.length = 0;
        globalThis.fetch = original;
    }
});

test('unauthorized URL selections and record dictionaries cannot populate the select; authorized aliases still resolve', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const calls: any[] = [];
    const options = [{ value: '7', label: 'Unauthorized cached user' }];
    const loadOptions = async (query: string, _signal: AbortSignal, exact = false) => {
        calls.push({ query, exact });
        return query === 'alice' && exact ? [{ value: '8', label: 'Alice · UID 8' }] : [];
    };
    const render = (value: string) => act(async () => root.render(h(MantineProvider, { env: 'test' },
        h(RecordFilterSelect, { key: value, label: 'User', value, options, loadOptions, onChange() {} }))));
    try {
        await render('7');
        const input = host.querySelector<HTMLInputElement>('input:not([type="hidden"])')!;
        assert.equal(input.value, '', 'denied hydration must not echo raw URL IDs or cached names');
        await act(async () => input.focus());
        await flushSearch();
        assert.equal(document.querySelectorAll('[role="option"]').length, 0);
        assert.ok(calls.some((call) => call.query === '7' && call.exact));
        await render('alice');
        assert.equal(host.querySelector<HTMLInputElement>('input:not([type="hidden"])')!.value, 'Alice · UID 8');
    } finally {
        await act(async () => root.unmount()); host.remove();
    }
});

test('searchable ShortSelect debounces, discards stale results and selects an ID instead of the query text', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const pending: { query: string, signal: AbortSignal, resolve: (value: any) => void }[] = [];
    const options: any[] = [];
    let selected = '';
    const loadOptions = (query: string, signal: AbortSignal) => new Promise<any[]>((resolve) => { pending.push({ query, signal, resolve }); });
    function Fixture() {
        const [value, setValue] = useState('');
        return h('form', {}, h(RecordFilterSelect, { label: 'User', placeholder: 'Search', value, options, loadOptions,
            onChange: (next: string) => { selected = next; setValue(next); } }));
    }
    try {
        await act(async () => root.render(h(MantineProvider, { env: 'test' }, h(Fixture))));
        const input = host.querySelector<HTMLInputElement>('input:not([type="hidden"])')!;
        assert.ok(input.classList.contains('hydro-select__input'));
        assert.ok(input.closest('.hydro-select--short'));
        await act(async () => input.focus());
        await enter(input, 'al');
        await enter(input, 'alice');
        assert.equal(pending.length, 0, 'typing is debounced');
        await flushSearch();
        assert.equal(pending.length, 1);
        assert.equal(pending[0].query, 'alice');
        await enter(input, 'bob');
        await flushSearch();
        assert.equal(pending[0].signal.aborted, true);
        await act(async () => pending[1].resolve([{ value: '42', label: 'Bob · UID 42' }]));
        await act(async () => pending[0].resolve([{ value: '7', label: 'Alice · UID 7' }]));
        const items = [...document.querySelectorAll('[role="option"]')];
        assert.deepEqual(items.map((item) => item.textContent), ['Bob · UID 42']);
        assert.equal(selected, '', 'typing must not change the applied selection');
        await act(async () => (items[0] as HTMLElement).click());
        assert.equal(selected, '42');
        assert.equal(input.value, 'Bob · UID 42');
        assert.equal(notices.length, 0);
        const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        await enter(input, 'unfinished query');
        await act(async () => input.dispatchEvent(event));
        assert.equal(event.defaultPrevented, true, 'an open search must not submit a half-typed form');
        const clear = host.querySelector<HTMLButtonElement>('[aria-label="Reset User"]')!;
        assert.ok(clear);
        await act(async () => clear.click());
        assert.equal(selected, '');
        assert.equal(input.value, '');
    } finally {
        await act(async () => root.unmount()); host.remove();
    }
    assert.equal(pending.at(-1)?.signal.aborted, true);
});

test('record filter selections preserve domain/list context, reset pagination and discard old-domain state', async () => {
    let domainId = 'team';
    let args: any = { rdocs: [{ _id: 'old-record' }], page: 3, limit: 25, all: true, filterLang: 'cc', filterStatus: 1,
        langs: { cc: { display: 'C++' } }, udict: {}, pdict: {} };
    const navigations: string[] = [];
    const fields = new Map<string, any>();
    const sockets: string[] = [];
    let rows: any[] = [];
    const { default: RecordMain } = load('../src/pages/record_main.tsx', {
        '@/components/common/addon-slots': { useHasRecordRowActions: () => false, RecordRowActionExtras: () => null },
        '@/components/common/button': { Button: ({ children, leftSection, ...props }: any) => h('button', props, children) },
        '@/components/common/data-table': { DataTable: ({ data }: any) => { rows = data; return null; } },
        '@/components/common/page-header': { PageHeader: () => null },
        '@/components/common/paginator': { Paginator: () => null },
        '@/components/common/select': { ShortSelect: () => null },
        '@/components/record/record-filter-select': { RecordFilterSelect: (props: any) => {
            fields.set(props.label, props);
            return null;
        } },
        '@/components/link': { Link: () => null },
        '@/components/record/record-status-badge': { RecordStatusBadge: () => null },
        '@/components/record/status-map': { STATUS_TEXTS: { 1: 'Accepted' } },
        '@/context/page-data': { usePageData: () => ({ args }) },
        '@/context/router': { useNavigate: () => (url: string) => navigations.push(url) },
        '@/hooks/use-build-url': { useBuildUrl: () => () => `/d/${domainId}/record` },
        '@/hooks/use-i18n': { useI18n: () => ({ t: translate }) },
        '@/hooks/use-websocket': { useWebSocket: ({ url }: any) => { sockets.push(url); } },
        '@/stores/session': { useSessionStore: (select: any) => select({ ui: { domainId } }) },
        '@/utils/record-filter-options': { recordFilterOptions, searchRecordFilterOptions },
        '@/utils/record-list': { formatScore: String, mergeLiveRecord: (records: any) => records },
        '@/utils/user-name': { formatUserName: () => '' },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = () => act(async () => root.render(h(MantineProvider, { env: 'test' }, h(RecordMain))));
    try {
        dom.reconfigure({ url: 'https://oj.example/d/team/record?page=3&pageSize=25&all=true&lang=cc&status=1' });
        await render();
        await act(async () => {
            fields.get('By Username / UID').onChange('7');
            fields.get('By Problem').onChange('12');
            fields.get('By Contest').onChange('6aeabd86888939840db7a9ed');
        });
        await act(async () => host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
        const target = new URL(navigations.at(-1)!, dom.window.location.origin);
        assert.equal(target.pathname, '/d/team/record');
        assert.equal(target.searchParams.get('uidOrName'), '7');
        assert.equal(target.searchParams.get('pid'), '12');
        assert.equal(target.searchParams.get('tid'), '6aeabd86888939840db7a9ed');
        for (const [key, value] of Object.entries({ pageSize: '25', all: 'true', lang: 'cc', status: '1' })) {
            assert.equal(target.searchParams.get(key), value);
        }
        assert.equal(target.searchParams.has('page'), false);
        domainId = 'other';
        args = { ...args, rdocs: [{ _id: 'new-record' }] };
        dom.reconfigure({ url: 'https://oj.example/d/other/record?page=3&pageSize=25' });
        await render();
        assert.equal(fields.get('By Username / UID').value, '');
        assert.equal(fields.get('By Problem').value, '');
        assert.equal(fields.get('By Contest').value, '');
        assert.equal(rows[0]._id, 'new-record');
        assert.equal(new URL(sockets.at(-1)!, dom.window.location.href).searchParams.get('domainId'), 'other');
    } finally {
        await act(async () => root.unmount()); host.remove();
    }
});
