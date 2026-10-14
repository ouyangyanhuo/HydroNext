import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/system/p', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Document: dom.window.Document,
    ShadowRoot: dom.window.ShadowRoot, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const { act, createElement: h, forwardRef } = require('react');
const { createRoot } = require('react-dom/client');
const { create } = require('zustand');
const mantine = require('@mantine/core');

async function fixture(uid = 0, topNav = false, captureMenu = false) {
    const store = create(() => ({
        user: { _id: uid, uname: `user${uid}`, priv: 0, avatar: '' },
        ui: { domainId: 'system', domain: { name: 'System' }, serverName: 'HydroNext' },
        theme: 'light', autoTheme: false, accentColor: 'teal', setTheme() {}, setAutoTheme() {}, setAccentColor() {},
    }));
    const calls: Array<{ url: string, init: RequestInit }> = [];
    let respond: (url: string, init: RequestInit) => Promise<any> = async () => ({
        ok: true, json: async () => ({ ddocs: [{ _id: 'team', name: 'My Team' }] }),
    });
    let onChange: ((opened: boolean) => void) | undefined;
    const capturedMenu: any = ({ children, onChange: callback }: any) => {
        onChange = callback;
        return h('div', null, children);
    };
    for (const part of ['Target', 'Dropdown', 'Label', 'Item']) {
        capturedMenu[part] = ({ children }: any) => h('div', null, children);
    }
    const buildUrl = () => '/d/system/home/domain';
    const mocks: Record<string, any> = {
        '@mantine/core': captureMenu ? { ...mantine, Menu: capturedMenu } : mantine,
        '@/components/common/button': { Button: mantine.Button, ActionIcon: mantine.ActionIcon, UnstyledButton: mantine.UnstyledButton },
        '@/hooks/use-build-url': { useBuildUrl: () => buildUrl },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/stores/session': { useSessionStore: store },
        '@/hooks/use-current-user': {
            useCurrentUser: () => store((state: any) => state.user), useIsLoggedIn: () => store((state: any) => state.user._id > 0),
        },
        '@/context/page-data': { usePageData: () => ({ name: 'homepage' }) },
        '@/hooks/use-permission': { PRIV: {}, PERM: {}, useHasPriv: () => false, useHasPerm: () => false },
        '@/registry/page-metadata': { getPageMetadata: () => ({ nav: 'homepage' }) },
        '@/assets/logo.png': '/logo.png',
        '@/components/user/user-avatar': { UserAvatar: () => h('span', null, 'Avatar') },
        '@/utils/user-name': { formatUserName: (user: any) => user.uname },
        '@/styles/accent-colors': {
            ACCENT_PRESETS: { teal: { name: 'Teal', light: { primary: '#3f879c' } } }, DEFAULT_ACCENT: 'teal', PRESET_KEYS: ['teal'],
        },
        '@/components/link': {
            Link: forwardRef(({ children, to, params: _, ...props }: any, ref: any) => h('a', { ...props, href: `/${to}`, ref }, children)),
        },
    };
    function load(file: string) {
        const module = { exports: {} as any };
        const code = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
            loader: 'tsx', format: 'cjs', jsx: 'automatic',
        }).code;
        runInNewContext(code, {
            module, exports: module.exports, window: dom.window, document: dom.window.document, AbortController,
            fetch: (url: string, init: RequestInit) => { calls.push({ url, init }); return respond(url, init); },
            require: (name: string) => mocks[name] ?? require(name),
        });
        return module.exports;
    }
    const { DomainSwitcher } = load('../src/components/navigation/domain-switcher.tsx');
    mocks['./domain-switcher'] = { DomainSwitcher };
    const Component = topNav ? load('../src/components/navigation/top-nav.tsx').TopNav : DomainSwitcher;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(mantine.MantineProvider, null, h(Component))));
    return {
        host, calls,
        setResponse(callback: typeof respond) { respond = callback; },
        get changeMenu() { return onChange!; },
        async setUid(next: number) { await act(async () => store.setState({ user: { _id: next, uname: `user${next}`, priv: 0, avatar: '' } })); },
        async clickDomain() {
            const button = host.querySelector('button');
            assert.ok(button);
            await act(async () => button.click());
        },
        async close() {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

test('a directly mounted guest domain switcher renders nothing and never requests private domains', async () => {
    const f = await fixture();
    try {
        assert.equal(f.host.textContent?.includes('System'), false);
        assert.equal(f.host.querySelector('button'), null);
        assert.equal(f.calls.length, 0);
    } finally { await f.close(); }
});

test('guest desktop navigation and mobile drawer hide domain entries while retaining login', async () => {
    const f = await fixture(0, true);
    try {
        assert.ok(f.host.textContent?.includes('Login'));
        assert.equal(f.host.textContent?.includes('System'), false);
        const burger = f.host.querySelector<HTMLButtonElement>('.mantine-Burger-root')!;
        assert.ok(burger);
        await act(async () => burger.click());
        assert.equal(document.body.textContent?.includes('My Domains'), false);
        assert.equal(document.body.textContent?.includes('Switch Domain'), false);
        assert.equal(f.calls.length, 0);
    } finally { await f.close(); }
});

test('logged-in domains load only on opening, show the response and reuse the cached list', async () => {
    const f = await fixture(7);
    try {
        assert.equal(f.calls.length, 0);
        await f.clickDomain();
        assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0].url, '/d/system/home/domain');
        assert.equal((f.calls[0].init.headers as any).Accept, 'application/json');
        assert.ok(document.body.textContent?.includes('My Team'));
        await f.clickDomain();
        await f.clickDomain();
        assert.equal(f.calls.length, 1);
    } finally { await f.close(); }
});

test('logout aborts a pending request and discards a late response', async () => {
    const f = await fixture(7);
    let finish: (response: any) => void;
    f.setResponse(() => new Promise((resolve) => { finish = resolve; }));
    try {
        await f.clickDomain();
        assert.equal(f.calls.length, 1);
        await f.setUid(0);
        assert.equal(f.calls[0].init.signal?.aborted, true);
        await act(async () => finish({ ok: true, json: async () => ({ ddocs: [{ _id: 'private', name: 'Private old team' }] }) }));
        assert.equal(f.host.querySelector('button'), null);
        assert.equal(document.body.textContent?.includes('Private old team'), false);
    } finally { await f.close(); }
});

test('a stale opening callback cannot request domains after logout and repeated openings deduplicate pending work', async () => {
    const f = await fixture(7, false, true);
    const oldOpen = f.changeMenu;
    let finish: (response: any) => void;
    f.setResponse(() => new Promise((resolve) => { finish = resolve; }));
    try {
        await act(async () => {
            oldOpen(true);
            oldOpen(true);
        });
        assert.equal(f.calls.length, 1);
        await f.setUid(0);
        await act(async () => oldOpen(true));
        assert.equal(f.calls.length, 1);
        await act(async () => finish({ ok: true, json: async () => ({ ddocs: [] }) }));
    } finally { await f.close(); }
});

test('account changes clear cached domains and load only the new account list', async () => {
    const f = await fixture(7);
    try {
        await f.clickDomain();
        assert.ok(document.body.textContent?.includes('My Team'));
        await f.setUid(8);
        assert.equal(document.body.textContent?.includes('My Team'), false);
        f.setResponse(async () => ({ ok: true, json: async () => ({ ddocs: [{ _id: 'new', name: 'New account team' }] }) }));
        await f.clickDomain();
        assert.equal(f.calls.length, 2);
        assert.ok(document.body.textContent?.includes('New account team'));
        assert.equal(document.body.textContent?.includes('My Team'), false);
    } finally { await f.close(); }
});
