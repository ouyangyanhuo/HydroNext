import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/team/register', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
after(async () => {
    // Let Mantine's deferred focus callbacks settle before removing browser globals.
    await new Promise((resolve) => setTimeout(resolve, 50));
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const { act, createElement: h, forwardRef } = require('react');
const { createRoot } = require('react-dom/client');
const mantine = require('@mantine/core');

async function fixture(page: string, ui: any = {}, response: any = {}, args: any = {}, user: any = { _id: 0 }) {
    const navigations: string[] = [];
    const notices: any[] = [];
    const calls: any[] = [];
    const mocks = {
        '@mantine/core': mantine,
        '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
        '@/components/common/button': { Button: mantine.Button },
        '@/components/auth/auth-panel': { AuthPanel: ({ children }: any) => h('main', null, children) },
        '@/components/link': {
            Link: forwardRef(({ children, to, ...props }: any, ref: any) => h('a', { ...props, href: `/${to}`, ref }, children)),
        },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/hooks/use-build-url': { useBuildUrl: () => (route: string) => `/d/team/${route}` },
        '@/context/router': { useNavigate: () => (url: string) => navigations.push(url) },
        '@/context/page-data': { usePageData: () => ({ args }) },
        '@/stores/session': { useSessionStore: (select: any) => select({ ui, user, language: 'en' }) },
        '@/utils/error': { formatErrorMessage: (error: any, fallback: string) => error?.message || fallback },
        '@/components/common/time-display': { TimeDisplay: () => null },
        '@/components/markdown/markdown-renderer': { MarkdownRenderer: () => null },
        '@/utils/i18n-content': { extractLocalizedContent: (content: string) => content },
        '@/utils/user-name': { formatUserName: (value: any) => value.uname },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, FormData: dom.window.FormData, URLSearchParams,
        require: (id: string) => mocks[id] ?? require(id),
        fetch: async (url: string, init: any) => {
            calls.push({ url, init });
            return { ok: !response.error, json: async () => response };
        },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(mantine.MantineProvider, null, h(module.exports.default))));
    return {
        host, calls, navigations, notices,
        async input(index: number, value: string) {
            const input = host.querySelectorAll('input')[index];
            await act(async () => {
                Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
                input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
            });
        },
        async submit() {
            await act(async () => {
                host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
            });
        },
        async close() { await act(async () => root.unmount()); host.remove(); },
    };
}

test('homepage guest registration is emphasized and follows the registration setting', async () => {
    const f = await fixture('homepage');
    try {
        assert.equal(f.host.querySelector('a[href="/user_register"]')?.getAttribute('data-variant'), 'filled');
        assert.equal(f.host.querySelector('a[href="/user_login"]')?.getAttribute('data-variant'), 'light');
    } finally { await f.close(); }
    const closed = await fixture('homepage', { registrationEnabled: false });
    try {
        assert.equal(closed.host.querySelector('a[href="/user_register"]'), null);
        assert.equal(closed.host.querySelector('a[href="/user_login"]')?.getAttribute('data-variant'), 'filled');
    } finally { await closed.close(); }
});

test('homepage never shows signup or login buttons to an authenticated user', async () => {
    const f = await fixture('homepage', {}, {}, {}, { _id: 2, uname: 'student' });
    try {
        assert.equal(f.host.querySelector('a[href="/user_register"]'), null);
        assert.equal(f.host.querySelector('a[href="/user_login"]'), null);
    } finally { await f.close(); }
});

test('registration defaults to visible and follows the domain-aware JSON redirect', async () => {
    const f = await fixture('user_register', {}, { url: '/d/team/register/code' });
    try {
        await f.input(0, 'student@example.com');
        await f.submit();
        assert.equal(f.calls[0].init.headers.Accept, 'application/json');
        assert.equal(f.calls[0].init.body.get('mail'), 'student@example.com');
        assert.deepEqual(f.navigations, ['/d/team/register/code']);
    } finally { await f.close(); }
});

test('closed registration has no form or request; verification sent renders success rather than reloading', async () => {
    const closed = await fixture('user_register', { registrationEnabled: false });
    try {
        assert.equal(closed.host.querySelector('form'), null);
        assert.match(closed.host.textContent!, /Public registration is disabled/);
        assert.equal(closed.calls.length, 0);
    } finally { await closed.close(); }
    const sent = await fixture('user_register', {}, { verificationEmailSent: true });
    try {
        await sent.input(0, 'student@example.com');
        await sent.submit();
        assert.match(sent.host.textContent!, /verification link has been sent/);
        assert.equal(sent.host.querySelector('form'), null);
    } finally { await sent.close(); }
});

test('default recovery shows administrator contact; configured recovery submits mail and shows success', async () => {
    const closed = await fixture('user_lostpass');
    try {
        assert.equal(closed.host.querySelector('form'), null);
        assert.match(closed.host.textContent!, /Please contact the administrator/);
    } finally { await closed.close(); }
    const f = await fixture('user_lostpass', { passwordResetEnabled: true }, { recoveryEmailSent: true });
    try {
        await f.input(0, 'student@example.com');
        await f.submit();
        assert.equal(JSON.parse(f.calls[0].init.body).mail, 'student@example.com');
        assert.match(f.host.textContent!, /password reset link has been sent/);
        assert.equal(f.host.querySelector('form'), null);
    } finally { await f.close(); }
});

test('recovery server errors use notifications and do not show a false success', async () => {
    const f = await fixture('user_lostpass', { passwordResetEnabled: true }, {
        error: { message: 'Please contact the administrator' },
    });
    try {
        await f.input(0, 'student@example.com');
        await f.submit();
        assert.equal(f.notices[0].color, 'red');
        assert.ok(f.host.querySelector('form'));
        assert.equal(f.navigations.length, 0);
    } finally { await f.close(); }
});

test('password reset sends both password fields required by the server', async () => {
    const f = await fixture('user_lostpass_with_code');
    try {
        await f.input(0, 'new-password');
        await f.input(1, 'new-password');
        await f.submit();
        assert.deepEqual(JSON.parse(f.calls[0].init.body), { password: 'new-password', verifyPassword: 'new-password' });
        assert.deepEqual(f.navigations, ['/d/team/user_login']);
    } finally { await f.close(); }
});

test('registration completion respects provider username locks and the server redirect', async () => {
    const f = await fixture('user_register_with_code', {}, { url: '/d/team/home/preference' }, {
        username: 'student', lockUsername: true,
    });
    try {
        const username = f.host.querySelector('input')!;
        assert.equal(username.value, 'student');
        assert.equal(username.readOnly, true);
        await f.input(1, 'password');
        await f.input(2, 'password');
        await f.submit();
        assert.equal(new URLSearchParams(f.calls[0].init.body).get('uname'), 'student');
        assert.deepEqual(f.navigations, ['/d/team/home/preference']);
    } finally { await f.close(); }
});
