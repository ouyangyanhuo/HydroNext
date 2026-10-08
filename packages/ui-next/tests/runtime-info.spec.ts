import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { isRuntimeInfo, runtimeDuration } from '../src/utils/runtime-info.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/manage/dashboard', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Document: dom.window.Document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const timers = new Map<number, () => void>();
let timerId = 0;
let monotonicNow = 0;
dom.window.setInterval = ((callback: () => void) => {
    const id = ++timerId;
    timers.set(id, callback);
    return id;
}) as any;
dom.window.clearInterval = ((id: number) => timers.delete(id)) as any;
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
const t = (key: string, values?: Record<string, number>) => Object.entries(values || {}).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), key,
);
function load(path: string, mocks: Record<string, any>) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, performance: { now: () => monotonicNow },
        require: (name: string) => mocks[name] || require(name),
    });
    return module.exports;
}
const { RuntimeStatusCard } = load('../src/components/manage/runtime-status-card.tsx', {
    '@/hooks/use-i18n': { useI18n: () => ({ t }) }, '@/utils/runtime-info': { isRuntimeInfo, runtimeDuration },
});
const snapshot = {
    kind: 'container' as const, startedAt: '2026-10-07T00:00:00Z', sampledAt: '2026-10-08T00:00:00Z',
    uptimeSeconds: 86400, containerDetected: true,
};
async function mount(element: any) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = async (next: any) => act(async () => root.render(h(MantineProvider, {}, next)));
    await render(element);
    return { host, render, close: async () => {
        await act(async () => root.unmount()); host.remove();
    } };
}

test('runtime duration handles days, rollovers, fractions and invalid values', () => {
    assert.deepEqual(runtimeDuration(90061.9), { days: 1, hours: 1, minutes: 1, seconds: 1 });
    assert.deepEqual(runtimeDuration(59, 1000), { days: 0, hours: 0, minutes: 1, seconds: 0 });
    assert.deepEqual(runtimeDuration(Number.NaN, -1), { days: 0, hours: 0, minutes: 0, seconds: 0 });
    assert.equal(isRuntimeInfo(snapshot), true);
    for (const invalid of [null, {}, { ...snapshot, startedAt: 'bad' }, { ...snapshot, uptimeSeconds: -1 }]) {
        assert.equal(isRuntimeInfo(invalid), false);
    }
});

test('runtime card advances from the server baseline and cleans timers when snapshot changes or unmounts', async () => {
    monotonicNow = 0;
    const view = await mount(h(RuntimeStatusCard, { runtime: snapshot }));
    try {
        assert.equal(view.host.querySelector('time')?.getAttribute('dateTime'), snapshot.startedAt);
        assert.match(view.host.textContent || '', /Container runtime/);
        assert.equal(view.host.querySelector('[data-runtime-uptime]')?.textContent, '1d 0h 0m 0s');
        monotonicNow = 65000;
        await act(async () => { for (const tick of timers.values()) tick(); });
        assert.equal(view.host.querySelector('[data-runtime-uptime]')?.textContent, '1d 0h 1m 5s');
        await view.render(h(RuntimeStatusCard, { runtime: { ...snapshot, sampledAt: '2026-10-08T00:01:00Z', uptimeSeconds: 10 } }));
        assert.equal(timers.size, 1);
        assert.equal(view.host.querySelector('[data-runtime-uptime]')?.textContent, '0d 0h 0m 10s');
        await view.render(h(RuntimeStatusCard, { runtime: null }));
        assert.equal(timers.size, 0);
        assert.match(view.host.textContent || '', /Runtime information unavailable/);
    } finally { await view.close(); }
    assert.equal(timers.size, 0);
});

test('application fallback is explicitly labelled instead of pretending to be container uptime', async () => {
    const view = await mount(h(RuntimeStatusCard, { runtime: { ...snapshot, kind: 'application', containerDetected: true } }));
    try {
        assert.match(view.host.textContent || '', /Application runtime/);
        assert.match(view.host.textContent || '', /Container timing is unavailable/);
    } finally { await view.close(); }
});

test('dashboard restricts runtime to admins and clock ticks do not rerender navigation cards', async () => {
    let admin = true;
    let pageRenders = 0;
    const { default: Dashboard } = load('../src/pages/manage_dashboard.tsx', {
        '@/components/manage/runtime-status-card': { RuntimeStatusCard },
        '@/components/common/button': { Button: ({ children }: any) => h('button', {}, children) },
        '@/components/common/page-header': { PageHeader: () => null },
        '@/components/link': { Link: () => null },
        '@/context/page-data': { usePageData: () => { pageRenders += 1; return { args: { runtime: snapshot } }; } },
        '@/hooks/use-i18n': { useI18n: () => ({ t }) },
        '@/hooks/use-permission': { PRIV: { PRIV_EDIT_SYSTEM: 1 }, useHasPriv: () => admin },
    });
    const view = await mount(h(Dashboard));
    try {
        const renders = pageRenders;
        monotonicNow += 1000;
        await act(async () => { for (const tick of timers.values()) tick(); });
        assert.equal(pageRenders, renders);
        admin = false;
        await view.render(h(Dashboard));
        assert.match(view.host.textContent || '', /Access Denied/);
        assert.doesNotMatch(view.host.textContent || '', /Container runtime/);
        assert.equal(timers.size, 0);
    } finally { await view.close(); }
});
