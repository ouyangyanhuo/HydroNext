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
    let canViewRanking = false;
    const store = create((set: any) => ({
        user: { _id: uid, uname: `user${uid}`, priv: 0, avatar: '' },
        ui: { domainId: 'system', domain: { name: 'System' }, serverName: 'HydroNext' },
        theme: 'light', autoTheme: false, accentColor: 'teal',
        setTheme(theme: string) { set({ theme, autoTheme: false }); }, setAutoTheme() {}, setAccentColor() {},
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
        '@/hooks/use-permission': { PRIV: {}, PERM: {}, useHasPriv: () => false, useHasPerm: () => canViewRanking },
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
        async setDomain(domainId: string, navigationHidden: Record<string, boolean>, ranking = true, contestMode = false) {
            canViewRanking = ranking;
            await act(async () => store.setState((state: any) => ({
                ui: { ...state.ui, domainId, domain: { name: domainId, navigationHidden, contestMode } },
            })));
        },
        setResponse(callback: typeof respond) { respond = callback; },
        async setRegistrationEnabled(enabled: boolean) {
            await act(async () => store.setState((state: any) => ({ ui: { ...state.ui, registrationEnabled: enabled } })));
        },
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
    const doc = document as any;
    const element = document.documentElement as any;
    const originalTransition = doc.startViewTransition;
    const originalAnimate = element.animate;
    const originalMatchMedia = dom.window.matchMedia;
    const animations: any[] = [];
    try {
        assert.ok(f.host.textContent?.includes('Login'));
        assert.equal(f.host.textContent?.includes('System'), false);
        const burger = f.host.querySelector<HTMLButtonElement>('.mantine-Burger-root')!;
        assert.ok(burger);
        await act(async () => burger.click());
        assert.equal(document.body.textContent?.includes('My Domains'), false);
        assert.equal(document.body.textContent?.includes('Switch Domain'), false);
        assert.equal(f.calls.length, 0);
        const themeToggle = f.host.querySelector<HTMLButtonElement>('button[aria-label="Switch to dark mode"]')!;
        assert.ok(themeToggle);
        doc.startViewTransition = (callback: () => void) => {
            callback();
            return { ready: Promise.resolve(), finished: Promise.resolve() };
        };
        element.animate = (frames: any, options: any) => {
            animations.push({ frames, options });
            return { finished: Promise.resolve(), cancel() {} };
        };
        await act(async () => themeToggle.click());
        assert.ok(f.host.querySelector('button[aria-label="Switch to light mode"]'));
        assert.equal(f.host.querySelector('button[aria-label="Theme mode"]'), null);
        await act(async () => themeToggle.click());
        assert.ok(f.host.querySelector('button[aria-label="Switch to dark mode"]'));
        assert.equal(animations.length, 2);
        assert.equal(animations[0].options.duration, 720);
        assert.equal(animations[0].options.pseudoElement, '::view-transition-new(root)');
        assert.match(animations[0].frames.clipPath[0], /^circle\(0px at /);
        doc.startViewTransition = undefined;
        await act(async () => themeToggle.click());
        assert.equal(themeToggle.disabled, true);
        assert.ok(f.host.querySelector('div[aria-hidden="true"].fixed'));
        await act(async () => new Promise((resolve) => setTimeout(resolve, 810)));
        assert.ok(f.host.querySelector('button[aria-label="Switch to light mode"]'));
        assert.equal(themeToggle.disabled, false);
        assert.equal(f.host.querySelector('div[aria-hidden="true"].fixed'), null);
        dom.window.matchMedia = () => ({ matches: true });
        await act(async () => themeToggle.click());
        assert.ok(f.host.querySelector('button[aria-label="Switch to dark mode"]'));
        assert.equal(f.host.querySelector('div[aria-hidden="true"].fixed'), null);
    } finally {
        await f.close();
        doc.startViewTransition = originalTransition;
        element.animate = originalAnimate;
        dom.window.matchMedia = originalMatchMedia;
    }
});

test('desktop and mobile guest registration entries follow the system registration switch', async () => {
    const f = await fixture(0, true);
    try {
        assert.equal(f.host.querySelector('a[href="/user_register"]')?.getAttribute('data-variant'), 'filled');
        assert.equal(f.host.querySelector('a[href="/user_login"]')?.getAttribute('data-variant'), 'subtle');
        await f.setRegistrationEnabled(false);
        assert.equal(f.host.querySelector('a[href="/user_register"]'), null);
        assert.equal(f.host.querySelector('a[href="/user_login"]')?.getAttribute('data-variant'), 'filled');
        const burger = f.host.querySelector<HTMLButtonElement>('.mantine-Burger-root')!;
        await act(async () => burger.click());
        assert.equal(document.body.querySelector('a[href="/user_register"]'), null);
        const loginLinks = document.body.querySelectorAll('a[href="/user_login"]');
        assert.ok(loginLinks.length >= 2, 'both desktop and mobile login buttons are present');
        for (const link of loginLinks) assert.equal(link.getAttribute('data-variant'), 'filled');
        await f.setRegistrationEnabled(true);
        const registrationLinks = document.body.querySelectorAll('a[href="/user_register"]');
        assert.ok(registrationLinks.length >= 2, 'both desktop and mobile registration buttons are present');
        for (const link of registrationLinks) assert.equal(link.getAttribute('data-variant'), 'filled');
        for (const link of document.body.querySelectorAll('a[href="/user_login"]')) assert.equal(link.getAttribute('data-variant'), 'subtle');
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

test('domain navigation settings hide desktop and mobile entries without leaking into other domains or granting ranking access', async () => {
    const f = await fixture(0, true);
    try {
        await f.setDomain('exam', { problem_main: true, training_main: true, homepage: true });
        assert.equal(f.host.querySelector('a[href="/problem_main"]'), null);
        assert.equal(f.host.querySelector('a[href="/training_main"]'), null);
        assert.ok(f.host.querySelector('a[href="/contest_main"]'));
        assert.ok(f.host.querySelector('a[href="/ranking"]'));
        assert.equal(f.host.querySelectorAll('a[href="/homepage"]').length, 1, 'the logo still provides a way home');
        await act(async () => f.host.querySelector<HTMLButtonElement>('.mantine-Burger-root')!.click());
        assert.ok(document.querySelector('[role="dialog"]'));
        assert.equal(document.querySelector('a[href="/training_main"]'), null);
        assert.equal(document.querySelector('a[href="/problem_main"]'), null);
        await f.setDomain('practice', {});
        assert.ok(document.querySelectorAll('a[href="/training_main"]').length >= 2);
        assert.ok(document.querySelectorAll('a[href="/problem_main"]').length >= 2);
        await f.setDomain('practice', { ranking: false }, false);
        assert.equal(document.querySelector('a[href="/ranking"]'), null);
        await f.setDomain('exam', { record_main: true }, true, true);
        assert.equal(document.querySelector('a[href="/homepage"]'), null);
        assert.equal(document.querySelector('a[href="/problem_main"]'), null);
        assert.equal(document.querySelector('a[href="/training_main"]'), null);
        assert.equal(document.querySelector('a[href="/record_main"]'), null);
        assert.ok(f.host.querySelector('a.group[href="/contest_main"]'), 'the logo links directly to contests');
        await f.setDomain('exam', { record_main: true });
        assert.ok(document.querySelector('a[href="/homepage"]'));
        assert.ok(document.querySelector('a[href="/problem_main"]'));
        assert.ok(document.querySelector('a[href="/training_main"]'));
        assert.equal(document.querySelector('a[href="/record_main"]'), null, 'manual hiding survives contest mode');
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
