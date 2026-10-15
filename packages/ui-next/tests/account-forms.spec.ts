import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { formatErrorMessage } from '../src/utils/error.ts';

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

async function fixture(page: string, ui: any = {}, response: any = {}, args: any = {}, user: any = { _id: 0 }, translations = {}) {
    dom.reconfigure({ url: page === 'contest_team' ? 'https://oj.example/d/team/contest/team' : 'https://oj.example/d/team/register' });
    const navigations: string[] = [];
    const notices: any[] = [];
    const calls: any[] = [];
    const copied: string[] = [];
    const mocks = {
        '@mantine/core': mantine,
        '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
        '@/components/common/button': { Button: mantine.Button, ActionIcon: mantine.ActionIcon },
        '@/components/common/page-header': { PageHeader: ({ children }: any) => h('header', null, children) },
        '@/components/common/confirm-dialog': { ConfirmDialog: ({ opened, title, message, onConfirm, loading }: any) => opened
            ? h('section', { 'data-confirm-dialog': true }, title, message,
                h('button', { 'data-confirm': true, disabled: loading, onClick: onConfirm }, 'Confirm')) : null },
        '@/components/user/user-avatar': { UserAvatar: () => h('span', null, 'Avatar') },
        '@/components/user/user-link': { UserLink: ({ user: value }: any) => h('span', null, value.uname) },
        '@/components/markdown/code-copy': { copyCodeText: async (value: string) => { copied.push(value); } },
        '@/components/auth/auth-panel': { AuthPanel: ({ children }: any) => h('main', null, children) },
        '@/components/auth/authenticator': {
            getAuthenticatorMethods: async () => ({ tfa: false, authn: false }), verifyWithWebAuthn: async () => 'challenge',
        },
        '@/components/auth/oauth-buttons': { OAuthButtons: () => null },
        '@/components/link': {
            Link: forwardRef(({ children, to, ...props }: any, ref: any) => h('a', { ...props, href: `/${to}`, ref }, children)),
        },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => translations[key] || key }) },
        '@/hooks/use-build-url': { useBuildUrl: () => (route: string) => `/d/team/${route}` },
        '@/context/router': { useNavigate: () => (url: string) => navigations.push(url) },
        '@/context/page-data': { usePageData: () => ({ args }) },
        '@/stores/session': { useSessionStore: (select: any) => select({ ui, user, language: 'en' }) },
        '@/utils/error': { formatErrorMessage },
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
        module, exports: module.exports, window: dom.window, document: dom.window.document, FormData: dom.window.FormData, URL, URLSearchParams,
        require: (id: string) => mocks[id] ?? require(id),
        fetch: async (url: string, init: any) => {
            calls.push({ url, init });
            return { ok: !response.error, headers: { get: () => 'application/json' }, json: async () => response };
        },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(mantine.MantineProvider, null, h(module.exports.default))));
    return {
        host, calls, navigations, notices, copied,
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

test('login shows a translated parameterized password error in its existing notification', async () => {
    const f = await fixture('user_login', {}, {
        error: { message: 'Invalid password for user {0}.', params: ['admin123'] },
    }, {}, { _id: 0 }, { 'Invalid password for user {0}.': '用户 {0} 的密码错误。' });
    try {
        await f.input(0, 'admin123');
        await f.input(1, 'wrong-password');
        await f.submit();
        assert.equal(f.notices[0].title, '用户 admin123 的密码错误。');
        assert.equal(f.notices[0].color, 'red');
        assert.equal(f.navigations.length, 0);
    } finally { await f.close(); }
});

test('registration and recovery notifications translate templates without translating dynamic values', async () => {
    for (const page of ['user_register', 'user_lostpass']) {
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture(page, { passwordResetEnabled: true }, {
            error: { message: 'User {0} not found.', params: ['student@example.com'] },
        }, {}, { _id: 0 }, { 'User {0} not found.': '用户 {0} 不存在。' });
        try {
            // eslint-disable-next-line no-await-in-loop
            await f.input(0, 'student@example.com');
            // eslint-disable-next-line no-await-in-loop
            await f.submit();
            assert.equal(f.notices[0].message, '用户 student@example.com 不存在。');
            assert.equal(f.notices[0].color, 'red');
            assert.equal(f.navigations.length, 0);
        // eslint-disable-next-line no-await-in-loop
        } finally { await f.close(); }
    }
});

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

test('team page replaces pending invites with a case-insensitive invitation-code join form', async () => {
    const f = await fixture('contest_team', {}, {}, { mine: [], invites: [{ _id: -1, displayName: 'Old invitation' }] }, { _id: 2 });
    try {
        assert.ok(f.host.textContent?.includes('Join a Team'));
        assert.ok(!f.host.textContent?.includes('Old invitation'));
        await f.input(0, 'abcdefgh');
        assert.equal(f.host.querySelector('input')!.value, 'ABCDEFGH');
        await f.submit();
        assert.deepEqual(JSON.parse(f.calls[0].init.body), { operation: 'join', code: 'ABCDEFGH' });
        assert.equal(f.calls[0].url, 'https://oj.example/d/team/contest/team');
        assert.deepEqual(f.navigations, ['/d/team/contest/team']);
        assert.equal(f.host.querySelector('input')!.value, '');
    } finally { await f.close(); }
});

test('team cards offer code copy and require confirmation before a reset', async () => {
    const f = await fixture('contest_team', {}, {}, {
        mine: [{ _id: -1000, uname: 'team:2:test', displayName: 'Team', members: [2], invitationCode: 'ABCDEFGH' }],
    }, { _id: 2 });
    try {
        assert.match(f.host.textContent!, /ABCDEFGH/);
        const copy = [...f.host.querySelectorAll('button')].find((button) => button.textContent === 'Copy')!;
        await act(async () => copy.click());
        assert.deepEqual(f.copied, ['ABCDEFGH']);
        await act(async () => f.host.querySelector<HTMLButtonElement>('[aria-label="Reset team invitation code"]')!.click());
        assert.equal(f.calls.length, 0);
        assert.match(f.host.textContent!, /old invitation code immediately/);
        await act(async () => f.host.querySelector<HTMLButtonElement>('[data-confirm]')!.click());
        assert.deepEqual(JSON.parse(f.calls[0].init.body), { operation: 'reset_code', vuid: -1000 });
    } finally { await f.close(); }
});

test('rejected team code requests keep the code and display an error notification', async () => {
    const f = await fixture('contest_team', {}, { error: { message: 'Invalid invitation code' } }, {}, { _id: 2 });
    try {
        await f.input(0, 'ABCDEFGH');
        await f.submit();
        assert.equal(f.notices[0].color, 'red');
        assert.equal(f.host.querySelector('input')!.value, 'ABCDEFGH');
        assert.equal(f.navigations.length, 0);
    } finally { await f.close(); }
});

test('expired sessions follow the authentication redirect without displaying a false join success', async () => {
    const f = await fixture('contest_team', {}, { url: '/d/team/login?redirect=team' }, {}, { _id: 2 });
    try {
        await f.input(0, 'ABCDEFGH');
        await f.submit();
        assert.deepEqual(f.navigations, ['/d/team/login?redirect=team']);
        assert.equal(f.notices.length, 0);
        assert.equal(f.host.querySelector('input')!.value, 'ABCDEFGH');
    } finally { await f.close(); }
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
