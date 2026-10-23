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
    let canViewRecords = true;
    let canViewHiddenContestRecords = true;
    let pageArgs: any = {};
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
    const buildUrl = (route?: string, params: any = {}, query: any = {}) => {
        const prefix = `/d/${store.getState().ui.domainId}`;
        if (route === 'contest_detail') return `${prefix}/contest/${params.tid}`;
        if (route === 'contest_scoreboard') return `${prefix}/contest/${params.tid}/scoreboard`;
        if (route === 'record_main') return `${prefix}/record?${new URLSearchParams(query)}`;
        return '/d/system/home/domain';
    };
    const mocks: Record<string, any> = {
        '@mantine/core': captureMenu ? { ...mantine, Menu: capturedMenu } : mantine,
        '@/components/common/button': { Button: mantine.Button, ActionIcon: mantine.ActionIcon, UnstyledButton: mantine.UnstyledButton },
        '@/hooks/use-build-url': { useBuildUrl: () => buildUrl },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/stores/session': { useSessionStore: store },
        '@/hooks/use-current-user': {
            useCurrentUser: () => store((state: any) => state.user), useIsLoggedIn: () => store((state: any) => state.user._id > 0),
        },
        '@/context/page-data': { usePageData: () => ({ name: 'homepage', args: pageArgs }) },
        '@/hooks/use-permission': { PRIV: {}, PERM: { PERM_VIEW_RECORD: 'records', PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD: 'hiddenRecords' },
            useHasPriv: () => false,
            useHasPerm: (perm: string) => perm === 'records' ? canViewRecords
                : perm === 'hiddenRecords' ? canViewHiddenContestRecords : canViewRanking },
        '@/utils/i18n-content': { extractLocalizedContent: (value: string) => value },
        '@/registry/page-metadata': { getPageMetadata: () => ({ nav: 'homepage' }) },
        '@/assets/logo.png': '/logo.png',
        '@/components/user/user-avatar': { UserAvatar: () => h('span', null, 'Avatar') },
        '@/utils/user-name': { formatUserName: (user: any) => user.uname },
        '@/styles/accent-colors': {
            ACCENT_PRESETS: { teal: { name: 'Teal', light: { primary: '#3f879c' } } }, DEFAULT_ACCENT: 'teal', PRESET_KEYS: ['teal'],
        },
        '@/components/link': {
            Link: forwardRef(({ children, to, href, params: _, ...props }: any, ref: any) => h('a',
                { ...props, href: href ?? `/${to}`, ref }, children)),
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
    const previewStore = load('../src/stores/domain-navigation-preview.ts').useDomainNavigationPreview;
    mocks['@/stores/domain-navigation-preview'] = { useDomainNavigationPreview: previewStore };
    mocks['@/hooks/use-navigation-motion'] = load('../src/hooks/use-navigation-motion.ts');
    const { DomainSwitcher } = load('../src/components/navigation/domain-switcher.tsx');
    mocks['./domain-switcher'] = { DomainSwitcher };
    const Component = topNav ? load('../src/components/navigation/top-nav.tsx').TopNav : DomainSwitcher;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = (extra: any = null) => act(async () => root.render(h(mantine.MantineProvider, null, h(Component), extra)));
    await render();
    return {
        host, calls, previewStore, store,
        async editVisibility(current: any = { _id: 'system' }) {
            pageArgs = { current, settings: [
                { key: 'contestMode', type: 'boolean', family: 'setting_contest_mode', value: false, name: 'Enable contest mode' },
                ...['homepage', 'problem_main', 'contest_main', 'training_main', 'record_main', 'ranking'].map((key) => ({
                    key: `navigationHidden.${key}`, type: 'boolean', family: 'setting_navigation', value: false,
                })),
            ] };
            mocks['@/components/common/page-header'] = { PageHeader: ({ title, children }: any) => h('header', null, title, children) };
            mocks['@/components/common/select'] = { LongSelect: mantine.Select, TagMultiSelect: mantine.MultiSelect };
            mocks['@/utils/error'] = { formatErrorMessage: (_error: any, fallback: string) => fallback };
            mocks['@mantine/notifications'] = { notifications: { show() {} } };
            mocks['@/components/common/settings-form'] = load('../src/components/common/settings-form.tsx');
            const Page = load('../src/pages/domain_edit.tsx').DomainSettingsPage;
            await render(h(Page, { visibility: true }));
        },
        leaveEditor: () => render(),
        async setDomain(domainId: string, navigationHidden: Record<string, boolean>, ranking = true, contestMode = false, contestFocus = '') {
            canViewRanking = ranking;
            await act(async () => store.setState((state: any) => ({
                ui: { ...state.ui, domainId, domain: { name: domainId, navigationHidden, contestMode, contestFocus } },
            })));
        },
        async setRecordPermission(value: boolean, hidden = value) {
            canViewRecords = value;
            canViewHiddenContestRecords = hidden;
            await render();
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

test('contest mode scopes desktop and mobile record/ranking links to its focus without granting record access or crossing domains', async () => {
    const f = await fixture(7, true);
    const tid = '1234567890abcdef12345678';
    try {
        await f.setDomain('exam', {}, true, true, tid);
        assert.ok(f.host.querySelector(`a[href="/d/exam/contest/${tid}"]`));
        assert.ok(f.host.querySelector(`a[href="/d/exam/contest/${tid}/scoreboard"]`));
        assert.ok(f.host.querySelector(`a[href="/d/exam/record?tid=${tid}"]`));
        await f.setRecordPermission(true, false);
        assert.ok(f.host.querySelector(`a[href="/d/exam/record?tid=${tid}&uidOrName=7"]`),
            'ordinary record permission does not reveal live contest records');
        await f.setRecordPermission(false);
        assert.ok(f.host.querySelector(`a[href="/d/exam/record?tid=${tid}&uidOrName=7"]`));
        await act(async () => f.host.querySelector<HTMLButtonElement>('.mantine-Burger-root')!.click());
        assert.equal(document.querySelectorAll(`a[href="/d/exam/contest/${tid}/scoreboard"]`).length, 2);
        assert.equal(document.querySelectorAll(`a[href="/d/exam/contest/${tid}"]`).length, 2);
        await f.setDomain('exam', {}, true, true, '');
        assert.ok(f.host.querySelector('a[href="/contest_main"]'));
        assert.ok(f.host.querySelector('a[href="/ranking"]'));
        assert.ok(f.host.querySelector('a[href="/record_main"]'));
        assert.equal(document.querySelector(`a[href*="${tid}"]`), null);
        await f.setDomain('practice', {}, true, false);
        assert.ok(f.host.querySelector('a[href="/ranking"]'));
        assert.ok(f.host.querySelector('a[href="/record_main"]'));
        assert.equal(document.querySelector(`a[href*="${tid}"]`), null);
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

test('navigation fades removed buttons, slides remaining buttons and cancels motion safely on rapid toggles and reduced motion', async () => {
    const prototype = dom.window.HTMLElement.prototype;
    const originalAnimate = prototype.animate;
    const originalRect = prototype.getBoundingClientRect;
    const originalMedia = dom.window.matchMedia;
    let reduced = false;
    let animations: any[] = [];
    prototype.getBoundingClientRect = function rect() {
        if (!this.dataset.navMotionId) return originalRect.call(this);
        const siblings = Array.from(this.parentElement!.querySelectorAll(':scope > [data-nav-motion-id]'));
        const index = siblings.indexOf(this);
        const x = this.parentElement!.classList.contains('mantine-Stack-root') ? 0 : index * 80;
        const y = this.parentElement!.classList.contains('mantine-Stack-root') ? index * 40 : 0;
        return { x, y, left: x, top: y, right: x + 80, bottom: y + 32, width: 80, height: 32 };
    };
    prototype.animate = function animate(frames: any, options: any) {
        let finish: () => void;
        let fail: (error: Error) => void;
        const finished = new Promise<void>((resolve, reject) => {
            finish = resolve;
            fail = reject;
        });
        const animation = { element: this, frames, options, finished, finish: () => finish(), canceled: false,
            cancel() { this.canceled = true; fail(new Error('Animation canceled')); } };
        animations.push(animation);
        return animation;
    };
    dom.window.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} });
    let f: Awaited<ReturnType<typeof fixture>> | undefined;
    try {
        f = await fixture(0, true);
        await f.setDomain('system', {});
        await act(async () => {
            for (const animation of animations) animation.finish();
        });
        animations = [];
        await f.setDomain('system', { homepage: true });
        const ghost = f.host.querySelector<HTMLElement>('[data-nav-motion-exit="homepage"]')!;
        assert.ok(ghost);
        assert.equal(ghost.inert, true);
        assert.equal(ghost.getAttribute('aria-hidden'), 'true');
        assert.equal(ghost.hasAttribute('href'), false);
        const exit = animations.find((animation) => animation.element === ghost);
        assert.equal(exit.options.duration, 180);
        assert.equal(exit.frames[1].opacity, 0);
        const moving = animations.find((animation) => animation.element.dataset.navMotionId === 'problem_main');
        assert.equal(moving.frames[0].transform, 'translate(80px, 0px)');
        assert.equal(moving.options.duration, 320);
        assert.equal(moving.options.delay, 60);
        await f.setDomain('system', {});
        assert.equal(moving.canceled, true);
        assert.equal(ghost.isConnected, false);
        assert.equal(f.host.querySelectorAll('[data-nav-motion-id="homepage"]').length, 1);
        await act(async () => f!.host.querySelector<HTMLButtonElement>('.mantine-Burger-root')!.click());
        await act(async () => {
            for (const animation of animations) animation.finish();
        });
        animations = [];
        await f.setDomain('system', { homepage: true });
        const mobileMove = animations.find((animation) => animation.element.dataset.navMotionId === 'problem_main'
            && animation.element.closest('[role="dialog"]'));
        assert.equal(mobileMove.frames[0].transform, 'translate(0px, 40px)');
        reduced = true;
        const count = animations.length;
        await f.setDomain('system', { homepage: true, problem_main: true });
        assert.equal(animations.length, count);
        assert.equal(document.querySelector('[data-nav-motion-exit]'), null);
        assert.equal(f.host.querySelector('a[href="/problem_main"]'), null);
    } finally {
        await f?.close();
        prototype.animate = originalAnimate;
        prototype.getBoundingClientRect = originalRect;
        dom.window.matchMedia = originalMedia;
    }
});

test('visibility checkboxes default to visible, preview locally and submit only on Save All Changes', async () => {
    const f = await fixture(0, true);
    try {
        await f.setDomain('system', {});
        await f.editVisibility();
        const card = Array.from(f.host.querySelectorAll<HTMLDivElement>('[role="button"]'))
            .find((item) => item.textContent?.includes('Show Problems navigation entry'))!;
        assert.ok(card);
        const checkboxes = f.host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
        assert.equal(checkboxes.length, 7);
        assert.equal(Array.from(checkboxes).filter((input) => input.checked).length, 6, 'navigation defaults on, contest mode off');
        await act(async () => card.click());
        assert.equal(card.querySelector<HTMLInputElement>('input')?.checked, false);
        assert.equal(f.host.querySelector('a[href="/problem_main"]'), null);
        assert.equal(f.calls.length, 0);
        assert.equal(f.store.getState().ui.domain.navigationHidden.problem_main, undefined);
        await act(async () => f.host.querySelector<HTMLButtonElement>('.mantine-Burger-root')!.click());
        assert.equal(document.querySelector('a[href="/problem_main"]'), null, 'mobile preview matches the desktop');
        await f.setDomain('other', {});
        assert.ok(f.host.querySelector('a[href="/problem_main"]'), 'preview never affects another domain');
        await f.setDomain('system', {});
        assert.equal(f.host.querySelector('a[href="/problem_main"]'), null);
        f.setResponse(async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) }));
        const save = Array.from(f.host.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent === 'Save All Changes')!;
        await act(async () => save.click());
        assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0].init.method, 'POST');
        const payload = JSON.parse(f.calls[0].init.body as string);
        assert.equal(payload['navigationHidden.problem_main'], true);
        assert.equal(payload['navigationHidden.contest_main'], false);
        assert.equal(payload.contestMode, false);
        const contestModeCard = Array.from(f.host.querySelectorAll<HTMLDivElement>('[role="button"]'))
            .find((item) => item.textContent?.includes('Enable contest mode'))!;
        await act(async () => contestModeCard.click());
        assert.equal(f.host.querySelector('a[href="/training_main"]'), null);
        assert.ok(f.host.querySelector('a[href="/contest_main"]'));
        assert.ok(f.host.querySelector('a[href="/ranking"]'));
        await act(async () => save.click());
        const unfocused = JSON.parse(f.calls[1].init.body as string);
        assert.equal(unfocused.contestMode, true);
        assert.equal(unfocused.contestFocus, '');
        await f.leaveEditor();
        assert.equal(f.previewStore.getState().preview, null);
        assert.ok(f.host.querySelector('a[href="/problem_main"]'), 'leaving discards local preview without modifying saved session data');
    } finally { await f.close(); }
});

test('saved hidden entries start unchecked and failed saves keep only a temporary preview', async () => {
    const f = await fixture(0, true);
    try {
        await f.setDomain('system', { ranking: true });
        await f.editVisibility({ _id: 'system', navigationHidden: { ranking: true } });
        const card = Array.from(f.host.querySelectorAll<HTMLDivElement>('[role="button"]'))
            .find((item) => item.textContent?.includes('Show Ranking navigation entry'))!;
        assert.equal(card.querySelector<HTMLInputElement>('input')?.checked, false);
        await act(async () => card.click());
        assert.ok(f.host.querySelector('a[href="/ranking"]'));
        f.setResponse(async () => ({ ok: false, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Failed' }) }));
        const save = Array.from(f.host.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent === 'Save All Changes')!;
        await act(async () => save.click());
        assert.equal(f.store.getState().ui.domain.navigationHidden.ranking, true);
        await f.leaveEditor();
        assert.equal(f.host.querySelector('a[href="/ranking"]'), null);
        assert.equal(f.previewStore.getState().preview, null);
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
