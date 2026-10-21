import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/team/home/preference', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const { act, createElement: h, forwardRef } = require('react');
const { createRoot } = require('react-dom/client');
const mantine = require('@mantine/core');

function load(path: string, mocks: Record<string, any>, browser: any = dom.window) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: browser, document: dom.window.document,
        require: (id: string) => Object.hasOwn(mocks, id) ? mocks[id] : id.endsWith('.css') ? {} : require(id),
        fetch: (...args: any[]) => mocks.fetch(...args),
    });
    return module.exports;
}

function session(browser: any = dom.window) {
    return load('../src/stores/session.ts', {
        '@/globals': { initialLang: 'en', initialPage: { args: {} } },
        '@/styles/accent-colors': { DEFAULT_ACCENT: 'teal' },
    }, browser).useSessionStore;
}

test('browser theme migrates the removed mode, follows the system and retains manual choices across navigation and blocked storage', () => {
    const storage = dom.window.localStorage;
    storage.clear();
    storage.setItem('hydro-ui-theme', 'paper');
    storage.setItem('hydro-ui-auto-theme', 'false');
    let dark = true;
    dom.window.matchMedia = () => ({ matches: dark, addEventListener() {}, removeEventListener() {} });
    const store = session();
    assert.equal(store.getState().theme, 'light');
    assert.equal(storage.getItem('hydro-ui-theme'), 'light');
    store.getState().setAutoTheme(true);
    assert.equal(store.getState().theme, 'dark');
    dark = false;
    store.getState().syncAutoTheme();
    assert.equal(store.getState().theme, 'light');
    store.getState().setTheme('dark');
    store.getState().syncAutoTheme();
    assert.equal(store.getState().theme, 'dark');
    assert.equal(store.getState().autoTheme, false);
    assert.equal(session().getState().theme, 'dark');
    const restricted = session({ localStorage: {
        getItem() { throw new Error('blocked'); },
        setItem() { throw new Error('blocked'); },
    } });
    restricted.getState().setTheme('dark');
    restricted.getState().setSession({ user: { _id: 1, theme: 'light' }, ui: { theme: 'light' } });
    assert.equal(restricted.getState().theme, 'dark');
    assert.equal(restricted.getState().autoTheme, false);
});

test('display preferences apply locally, listen for system changes and exclude appearance from server saves', async () => {
    dom.window.localStorage.clear();
    let dark = false;
    const listeners = new Set<() => void>();
    dom.window.matchMedia = (query: string) => ({
        get matches() { return query === '(prefers-color-scheme: dark)' && dark; },
        addEventListener: (_event: string, listener: () => void) => { if (query.includes('color-scheme')) listeners.add(listener); },
        removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    });
    const store = session();
    const requests: any[] = [];
    const mocks: Record<string, any> = {
        '@/stores/session': { useSessionStore: store },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/components/common/button': { Button: mantine.Button },
        '@/components/common/select': { LongSelect: mantine.Select, TagMultiSelect: mantine.MultiSelect },
        '@/utils/lang-display': { LANG_DISPLAY: {}, getLangDisplay: (k: string) => k },
        '@/components/feedback/hydro-notifications': { HydroNotifications: () => null },
        '@mantine/notifications': { Notifications: () => null, notifications: { show() {} } },
        '@/styles/accent-colors': { ACCENT_PRESETS: {}, getAccentScheme() {}, accentToCssVars() {} },
        '@/styles/mantine-theme': { createDynamicTheme: () => ({ theme: {} }) },
        '@/context/page-data': { usePageData: () => ({ args: { category: 'preference', settings: [
            { family: 'setting_display', key: 'viewLang', type: 'text', value: 'en' },
        ] } }) },
        '@/hooks/use-build-url': { useBuildUrl: () => (route: string) => `/d/team/${route}` },
        '@/hooks/use-object-url': { useObjectUrl: () => null },
        '@/components/user/framed-avatar': { FramedAvatar: () => null },
        '@/components/common/page-header': { PageHeader: () => null },
        '@/components/link': { Link: forwardRef(({ children }: any, ref: any) => h('a', { ref }, children)) },
        '@/utils/avatar': { getAvatarUrl: () => '' },
        '@/utils/error': { formatErrorMessage: () => '' },
        fetch: async (_url: string, init: any) => {
            requests.push(JSON.parse(init.body));
            return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) };
        },
    };
    mocks['@/components/common/settings-form'] = load('../src/components/common/settings-form.tsx', mocks);
    const { Providers } = load('../src/app/providers.tsx', mocks);
    const Page = load('../src/pages/home_settings.tsx', mocks).default;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(h(Providers, null, h(Page))));
        const toggle = host.querySelector<HTMLInputElement>('input[role="switch"]')!;
        assert.ok(toggle.checked);
        assert.ok(toggle.closest('.hydro-settings-section')?.textContent?.includes('setting_display'));
        assert.equal(listeners.size, 1);
        await act(async () => {
            dark = true;
            for (const listener of listeners) listener();
        });
        assert.equal(document.documentElement.getAttribute('data-mantine-color-scheme'), 'dark');
        await act(async () => toggle.click());
        assert.equal(store.getState().autoTheme, false);
        assert.equal(dom.window.localStorage.getItem('hydro-ui-auto-theme'), 'false');
        assert.equal(listeners.size, 0);
        assert.equal(requests.length, 0);
        await act(async () => {
            dark = false;
            window.dispatchEvent(new dom.window.Event('focus'));
        });
        assert.equal(store.getState().theme, 'dark');
        const save = host.querySelector<HTMLButtonElement>('button.hydro-settings-save')!;
        await act(async () => save.click());
        assert.equal(requests.length, 1);
        assert.deepEqual(Object.keys(requests[0]).sort(), ['booleanKeys', 'category', 'viewLang']);
        await act(async () => toggle.click());
        assert.equal(store.getState().theme, 'light');
        assert.equal(listeners.size, 1);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
    assert.equal(listeners.size, 0);
});
