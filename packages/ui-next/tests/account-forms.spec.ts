import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { formatErrorMessage } from '../src/utils/error.ts';
import { goBackOrFallback } from '../src/utils/history-back.ts';
import { INVITATION_CODE_LENGTH, isInvitationCodeComplete } from '../src/utils/invitation-code';
import { toBigInt } from '../src/utils/permissions.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/team/register', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    Document: dom.window.Document, ShadowRoot: dom.window.ShadowRoot,
    HTMLAnchorElement: dom.window.HTMLAnchorElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.defineProperty(dom.window.document, 'fonts', { value: { addEventListener() {}, removeEventListener() {}, ready: Promise.resolve() } });
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

async function fixture(page: string, ui: any = {}, response: any = {}, args: any = {}, user: any = { _id: 0 }, translations = {}, pageName = page) {
    const path = page === 'contest_team' ? 'contest/team' : page === 'contest_detail' ? 'contest/123'
        : page === 'manage_user_edit' ? 'manage/users/42?page=3&q=student' : 'register';
    dom.reconfigure({ url: `https://oj.example/d/team/${path}` });
    const navigations: string[] = [];
    const notices: any[] = [];
    const calls: any[] = [];
    const copied: string[] = [];
    const prefix = ui.domainId === 'system' ? '' : `/d/${ui.domainId || 'team'}`;
    const buildUrl = (route: string, params: any = {}, query: any = {}) => {
        if (route === 'problem_detail') return `${prefix}/p/${params.pid}?${new URLSearchParams(query)}`;
        if (route === 'record_detail') return `${prefix}/record/${params.rid}`;
        if (route === 'contest_detail') return `${prefix}/contest/${params.tid}`;
        const search = new URLSearchParams(query).toString();
        if (route === 'manage_user_edit') return `${prefix}/manage/users/${params.uid}${search ? `?${search}` : ''}`;
        return `${prefix}/${route}${search ? `?${search}` : ''}`;
    };
    const mocks: Record<string, any> = {
        '@/components/common/addon-slots': { ScoreboardCellExtras: () => null },
        './contest-detail.css': {},
        './ranking.css': {},
        '@mantine/core': mantine,
        '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
        '@/components/common/button': { Button: mantine.Button, ActionIcon: mantine.ActionIcon, UnstyledButton: mantine.UnstyledButton },
        '@/components/common/delete-resource-button': { DeleteResourceButton: () => null },
        '@/components/common/select': {
            ShortSelect: page === 'contest_scoreboard' ? mantine.Select : () => null,
            LongSelect: ({ data, value, onChange, disabled, label }: any) => h('select', {
                value, disabled, 'aria-label': label, onChange: (event: any) => onChange(event.target.value),
            }, data.flatMap((item: any) => item.items || [item]).map((item: any) => h('option', { key: item.value, value: item.value }, item.label))),
        },
        '@/components/contest/contest-proctor-notice': { ContestProctorNotice: () => null },
        '@/components/contest/contest-timer': { ContestTimer: () => null },
        '@/components/contest/team-identity': { TeamIdentity: () => null },
        '@/components/record/record-status-badge': { RecordStatusBadge: () => null },
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
            Link: forwardRef(({ children, to, href, params, ...props }: any, ref: any) => h('a', {
                ...props, href: href ?? (to === 'record_detail' ? buildUrl(to, params) : `/${to}`), ref,
            }, children)),
        },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => translations[key] || key }) },
        '@/hooks/use-build-url': { useBuildUrl: () => buildUrl },
        '@/hooks/use-current-user': { useCurrentUser: () => user, useIsLoggedIn: () => user._id > 0 },
        '@/hooks/use-permission': {
            PERM: { PERM_EDIT_CONTEST: 1n << 50n, PERM_EDIT_CONTEST_SELF: 1n << 51n, PERM_ALL: -1n },
            useHasPerm: () => false,
            hasPermValue: () => false,
        },
        '@/hooks/use-time': { useDeadlinePassed: (date: string) => new Date(date).getTime() <= Date.now() },
        '@/context/router': { useNavigate: () => (url: string) => navigations.push(url) },
        '@/context/page-data': { usePageData: () => ({ args, name: pageName }) },
        '@/stores/session': { useSessionStore: (select: any) => select({ ui, user, language: 'en' }) },
        '@/utils/error': { formatErrorMessage },
        '@/utils/history-back': { goBackOrFallback },
        '@/utils/permissions': { toBigInt },
        '@/utils/contest-problem-time': { formatContestClock: () => '0:00' },
        '@/utils/proctor': { proctorError: (error: any) => error.message, proctorAccessRequest: () => null },
        '@/utils/invitation-code': { INVITATION_CODE_LENGTH, isInvitationCodeComplete },
        './invitation-code-input.css': {},
        '@/components/common/time-display': { TimeDisplay: () => null },
        '@/components/common/paginator': { Paginator: () => null },
        '@/components/common/data-table': {
            DataTable: ({ data, columns }: any) => h('div', null,
                data.map((row: any) => h('div', { key: row._id },
                    columns.map((column: any) => h('div', { key: column.key }, column.render?.(row))),
                )),
            ),
        },
        '@/components/markdown/markdown-renderer': { MarkdownRenderer: () => null },
        '@/utils/i18n-content': { extractLocalizedContent: (content: string) => content },
        '@/utils/user-name': { formatUserName: (value: any) => value.uname },
    };
    if (page === 'contest_team') {
        const component = { exports: {} as any };
        runInNewContext(transformSync(readFileSync(new URL('../src/components/common/invitation-code-input.tsx', import.meta.url), 'utf8'), {
            loader: 'tsx', format: 'cjs', jsx: 'automatic',
        }).code, { module: component, exports: component.exports, require: (id: string) => mocks[id] ?? require(id) });
        mocks['@/components/common/invitation-code-input'] = component.exports;
    }
    if (page === 'contest_scoreboard' || page === 'manage_setting') {
        for (const [componentId, componentPath] of (page === 'manage_setting' ? [
            ['@/components/common/settings-form', '../src/components/common/settings-form.tsx'],
        ] : [
            ['@/components/user/user-link', '../src/components/user/user-link.tsx'],
            ['@/components/contest/team-identity', '../src/components/contest/team-identity.tsx'],
        ])) {
            const component = { exports: {} as any };
            runInNewContext(transformSync(readFileSync(new URL(componentPath, import.meta.url), 'utf8'), {
                loader: 'tsx', format: 'cjs', jsx: 'automatic',
            }).code, { module: component, exports: component.exports, require: (id: string) => mocks[id] ?? require(id) });
            mocks[componentId] = component.exports;
        }
    }
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, document: dom.window.document, FormData: dom.window.FormData, URL, URLSearchParams,
        localStorage: dom.window.localStorage,
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
                if (page === 'contest_team' && index === 0) {
                    const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
                    Object.defineProperty(event, 'clipboardData', { value: { getData: () => value } });
                    input.dispatchEvent(event);
                    return;
                }
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

test('system settings use compact grids, keep long fields full-width and preserve nested saves and secret placeholders', async () => {
    const view = await fixture('manage_setting', {}, {}, {
        settings: [
            { family: 'server', key: 'server.name', type: 'text', name: 'Site name' },
            { family: 'server', key: 'server.url', type: 'text', name: 'Site URL' },
            { family: 'server', key: 'server.allowRegister', type: 'boolean', name: 'Registration' },
            { family: 'server', key: 'server.checkUpdate', type: 'boolean', name: 'Check updates' },
            { family: 'server', key: 'server.notice', type: 'textarea', subType: 'yaml', name: 'Notice' },
            { family: 'server', key: 'server.password', type: 'password', name: 'Secret', flag: 4 },
            { family: 'access', key: 'access.a', type: 'boolean', name: 'Access A' },
            { family: 'access', key: 'access.b', type: 'boolean', name: 'Access B' },
        ],
        current: { 'server.name': 'HydroNext', 'server.url': '/', 'server.allowRegister': true, 'server.checkUpdate': true,
            'server.notice': 'Long content', 'server.password': 'never-expose-this', 'access.a': true, 'access.b': false },
    });
    try {
        const grid = view.host.querySelector('.hydro-settings-fields')!;
        assert.ok(grid);
        assert.equal(grid.querySelectorAll(':scope > .hydro-settings-field').length, 5);
        const checkbox = grid.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        const toggles = checkbox.closest('.hydro-settings-fields--booleans')!;
        assert.ok(toggles?.parentElement?.classList.contains('hydro-settings-field--wide'), 'the boolean group starts its own full row');
        assert.equal(toggles.querySelector('textarea, input:not([type="checkbox"])'), null, 'text inputs never share the boolean grid');
        const editor = grid.querySelector('textarea')!;
        assert.ok(editor.closest('.hydro-settings-field--wide'), 'long content retains the full row');
        assert.equal(editor.style.height, '240px');
        assert.equal(editor.style.minHeight, '240px');
        assert.equal(editor.style.maxHeight, '240px');
        assert.equal(editor.style.overflowY, 'auto');
        assert.equal(editor.style.resize, 'none');
        assert.equal(editor.style.fontFamily, 'var(--hydro-font-mono)');
        assert.equal(view.host.querySelectorAll('.hydro-setting-checkbox-card').length, 2, 'boolean-only groups use the multi-column tiles');
        assert.equal(view.host.querySelector<HTMLInputElement>('input[type="password"]')?.value, '');
        assert.ok(!view.host.textContent?.includes('never-expose-this'));
        const longContent = Array.from({ length: 100 }, (_, index) => `entry_${index}: ${index}`).join('\n');
        await act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, longContent);
            editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        assert.equal(editor.value, longContent);
        assert.equal(editor.style.height, '240px', 'long content must not increase editor height');
        await view.input(0, 'Updated name');
        await act(async () => checkbox.click());
        await act(async () => view.host.querySelector<HTMLButtonElement>('.hydro-settings-save')!.click());
        assert.deepEqual(JSON.parse(view.calls[0].init.body), {
            server: { name: 'Updated name', url: '/', allowRegister: false, checkUpdate: true, notice: longContent, password: '' },
            access: { a: true, b: false },
            booleanKeys: { server: { allowRegister: true, checkUpdate: true }, access: { a: true, b: true } },
        });
        assert.equal(view.notices.at(-1).title, 'Saved');
    } finally { await view.close(); }
});

test('manage_setting renders clean card layout without sidebar or icons, back link to dashboard, and sticky save bar', async () => {
    const view = await fixture('manage_setting', {}, {}, {
        settings: [
            { family: 'setting_server', key: 'server.name', type: 'text', name: 'Site name' },
            { family: 'setting_smtp', key: 'smtp.host', type: 'text', name: 'SMTP Host' },
            { family: 'setting_limits', key: 'limit.submission', type: 'number', name: 'Rate limit' },
        ],
        current: { 'server.name': 'Hydro', 'smtp.host': 'mail.example.com', 'limit.submission': 60 },
    });
    try {
        const page = view.host.querySelector('.hydro-settings-page')!;
        assert.ok(page, 'wraps in .hydro-settings-page container');
        const backLink = view.host.querySelector<HTMLAnchorElement>('a[href="/manage_dashboard"]')!;
        assert.ok(backLink, 'provides a back button to manage_dashboard');
        assert.equal(view.host.querySelector('.hydro-settings-nav'), null, 'does not render a sidebar navigation');
        assert.equal(view.host.querySelectorAll('svg').length, 0, 'does not render icons');
        assert.equal(view.host.querySelectorAll('.hydro-settings-section').length, 3, 'renders all 3 section cards');
        const savebar = view.host.querySelector('.hydro-settings-savebar')!;
        assert.ok(savebar, 'provides floating sticky save bar');
        assert.ok(savebar.querySelector('.hydro-settings-save'));
    } finally { await view.close(); }
});

test('managed user names open the editor and the profile form preserves drafts, sudo redirects and scoped back links', async () => {
    const list = await fixture('manage_user', {}, {}, { page: 3, q: 'student', udocs: [{ _id: 42, uname: 'student', canEditProfile: true }] });
    try {
        assert.ok(list.host.querySelector('a[href="/d/team/manage/users/42?page=3&q=student"]'));
        assert.equal(list.host.querySelector('a[href^="/user_detail"]'), null);
        const search = list.host.querySelector<HTMLInputElement>('input[aria-label="Search users by username, UID or email"]')!;
        const submit = list.host.querySelector<HTMLButtonElement>('button[aria-label="Search"]')!;
        assert.ok(search.closest('.hydro-list-toolbar'));
        assert.ok(submit.closest('.mantine-Input-wrapper'), 'search action is embedded in the input instead of a separate text button');
        assert.equal(submit.textContent, '');
        await list.input(0, '  admin  ');
        await act(async () => submit.click());
        assert.equal(list.navigations.at(-1), '/d/team/manage_user?q=admin');
        await list.input(0, '42');
        await act(async () => search.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
        assert.equal(list.navigations.at(-1), '/d/team/manage_user?q=42');
    } finally { await list.close(); }
    for (const response of [{ saved: true }, { error: { message: 'Denied' } }, { url: '/d/team/user/sudo' }]) {
        // eslint-disable-next-line no-await-in-loop
        const form = await fixture('manage_user_edit', {}, response, {
            profile: { _id: 42, uname: 'student', bio: 'Bio draft', qq: '12345', school: 'School A', studentId: '001', phone: '0123' },
        });
        try {
            assert.ok(form.host.querySelector('a[href="/d/team/manage_user?page=3&q=student"]'));
            assert.equal(form.host.querySelector('textarea')?.value, 'Bio draft');
            // eslint-disable-next-line no-await-in-loop
            await form.input(1, '54321');
            // eslint-disable-next-line no-await-in-loop
            await act(async () => form.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
            // eslint-disable-next-line no-await-in-loop
            await form.submit();
            const payload = JSON.parse(form.calls[0].init.body);
            assert.deepEqual(payload, { bio: 'Bio draft', qq: '54321', school: 'School A', studentId: '001', phone: '0123', resetAvatar: true });
            assert.equal(form.calls[0].url, 'https://oj.example/d/team/manage/users/42?page=3&q=student');
            if ('saved' in response) {
                assert.equal(form.notices.at(-1).color, 'green');
            } else if ('error' in response) {
                assert.equal(form.notices.at(-1).color, 'red');
                assert.equal(form.host.querySelector('textarea')?.value, 'Bio draft');
                assert.equal(form.navigations.length, 0);
            } else {
                assert.deepEqual(form.navigations, ['/d/team/user/sudo']);
                assert.equal(form.notices.length, 0, 'requiring sudo is not a successful save');
            }
        // eslint-disable-next-line no-await-in-loop
        } finally { await form.close(); }
    }
});

test('only focused contests hide ordinary contestants scoreboard buttons and pre-start errors offer a back action', async () => {
    const tid = '1234567890abcdef12345678';
    for (const state of [
        { contestMode: true, contestFocus: tid, hidden: true },
        { contestMode: true, contestFocus: 'other', hidden: false },
        { contestMode: false, contestFocus: tid, hidden: false },
        { contestMode: true, contestFocus: '', hidden: false },
    ]) {
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture('contest_detail', { domain: state }, {}, {
            tdoc: { docId: tid, _id: 'database-id', title: 'Focus contest' },
        }, { _id: 2 });
        try {
            assert.equal(f.host.querySelector('a[href="/d/team/contest_main"]') === null, state.hidden);
            assert.equal(f.host.querySelector('a[href="/contest_scoreboard"]') === null, state.hidden);
        // eslint-disable-next-line no-await-in-loop
        } finally { await f.close(); }
    }
    for (const canEdit of [false, true]) {
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture('contest_detail', { domain: { contestMode: true, contestFocus: tid } }, {}, {
            tdoc: { docId: tid, title: 'Contest' }, tsdoc: { attend: true }, canEdit,
        }, { _id: 2 });
        try {
            assert.equal(!!f.host.querySelector('a[href="/contest_scoreboard"]'), canEdit);
        // eslint-disable-next-line no-await-in-loop
        } finally { await f.close(); }
    }
    const oldBack = dom.window.history.back;
    let backCalls = 0;
    dom.window.history.pushState({}, '', '/d/team/record?tid=contest');
    dom.window.history.back = () => { backCalls++; };
    const f = await fixture('error', {}, {}, {
        code: 403, error: { name: 'ContestNotStartedError', message: 'The contest has not started yet and cannot be viewed.' },
    }, { _id: 2 }, { 'The contest has not started yet and cannot be viewed.': '比赛未开始，暂时无法查看。' });
    try {
        assert.ok(f.host.textContent?.includes('比赛未开始，暂时无法查看。'));
        await act(async () => Array.from(f.host.querySelectorAll('button')).find((button) => button.textContent === 'Back')!.click());
        assert.equal(backCalls, 1);
    } finally {
        await f.close();
        dom.window.history.back = oldBack;
    }
});

test('scoreboard back uses history or a domain-scoped fallback and only editors see the three exports', async () => {
    const originalBack = dom.window.history.back;
    const originalLength = Object.getOwnPropertyDescriptor(dom.window.history, 'length');
    let backCalls = 0;
    dom.window.history.back = () => { backCalls++; };
    try {
        for (const domainId of ['system', 'exam']) {
            for (const canEdit of [false, true]) {
                // eslint-disable-next-line no-await-in-loop
                const f = await fixture('contest_scoreboard', { domainId }, {}, {
                    tdoc: { docId: 'contest1', domainId, title: 'Contest' }, canEdit,
                }, { _id: 2 });
                try {
                    const exports = [...f.host.querySelectorAll('a')].filter((link) => link.textContent?.startsWith('Export as'));
                    assert.equal(exports.length, canEdit ? 3 : 0);
                    const back = [...f.host.querySelectorAll('button')].find((button) => button.textContent === 'Back')!;
                    assert.ok(back);
                    assert.equal(back.closest('.ranking-page-header')?.firstElementChild?.contains(back), false,
                        'back belongs to the right-hand actions, not the title');
                    Object.defineProperty(dom.window.history, 'length', { configurable: true, value: 2 });
                    const before = backCalls;
                    // eslint-disable-next-line no-await-in-loop
                    await act(async () => back.click());
                    assert.equal(backCalls, before + 1);
                    assert.equal(f.navigations.length, 0);
                    Object.defineProperty(dom.window.history, 'length', { configurable: true, value: 1 });
                    // eslint-disable-next-line no-await-in-loop
                    await act(async () => back.click());
                    assert.deepEqual(f.navigations, [`${domainId === 'system' ? '' : '/d/exam'}/contest/contest1`]);
                // eslint-disable-next-line no-await-in-loop
                } finally { await f.close(); }
            }
        }
    } finally {
        dom.window.history.back = originalBack;
        if (originalLength) Object.defineProperty(dom.window.history, 'length', originalLength);
        else Reflect.deleteProperty(dom.window.history, 'length');
    }
});

test('scoreboard missing edit metadata still recognizes root and ownership permissions without bypassing session scope', async () => {
    for (const entry of [
        { user: { _id: 2, perm: 'BigInt::-1', scope: 'BigInt::-1', priv: -1 }, tdoc: { owner: 7 }, expected: 3 },
        { user: { _id: 2, perm: -1, scope: '0', priv: -1 }, tdoc: { owner: 7 }, expected: 0 },
        { user: { _id: 2, perm: String(1n << 51n) }, tdoc: { owner: 2 }, expected: 3 },
        { user: { _id: 2, perm: String(1n << 51n) }, tdoc: { owner: 7, maintainer: [2] }, expected: 3 },
        { user: { _id: 2, perm: String(1n << 51n) }, tdoc: { owner: 7 }, expected: 0 },
        { user: { _id: 2, perm: '0' }, tdoc: { owner: 7 }, expected: 0 },
    ]) {
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture('contest_scoreboard', {}, {}, { tdoc: { docId: 'contest', ...entry.tdoc } }, entry.user);
        try {
            assert.equal([...f.host.querySelectorAll('a')].filter((link) => link.textContent?.startsWith('Export as')).length, entry.expected);
        // eslint-disable-next-line no-await-in-loop
        } finally { await f.close(); }
    }
});

test('scoreboard filters translate personal/team labels, rename the implicit UID group and preserve history state', async () => {
    const translations = require('yaml').parse(readFileSync(new URL('../locales/zh.yaml', import.meta.url), 'utf8'));
    for (const allowTeam of [false, true]) {
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture('contest_scoreboard', {}, {}, {
            tdoc: { docId: 'filter-test', allowTeam },
            groups: [{ name: 'Study group', uids: [4, 5] }, { name: 'Duplicate group', uids: [4, 5] },
                { name: '4', uids: [4] }, { name: 'Empty group', uids: [] }],
            rows: [[{ type: 'user' }, { type: 'rank' }],
                [{ type: 'user', raw: 4, value: 'Alice' }, { type: 'rank', value: 1 }],
                [{ type: 'user', raw: 5, value: 'Bob' }, { type: 'rank', value: 0 }]],
        }, { _id: 4 }, translations);
        try {
            const input = f.host.querySelector<HTMLInputElement>('input[aria-label="筛选参赛者"]')!;
            assert.ok(input);
            dom.window.history.replaceState({ marker: 'keep-router-state' }, '', '#filter=4');
            // eslint-disable-next-line no-await-in-loop
            await act(async () => dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')));
            assert.equal(input.value, '仅自己');
            assert.ok(f.host.textContent?.includes('Alice'));
            assert.ok(!f.host.textContent?.includes('Bob'));
            // eslint-disable-next-line no-await-in-loop
            await act(async () => input.click());
            const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
            assert.deepEqual(options.map((option) => option.textContent), [
                allowTeam ? '所有参赛者' : '全部用户', allowTeam ? '已关注的参赛者' : '已关注的用户',
                allowTeam ? '计入排名的参赛者' : '计入排名的用户', 'Study group', '仅自己',
            ]);
            // eslint-disable-next-line no-await-in-loop
            await act(async () => options[2].click());
            assert.equal(dom.window.location.hash, '#filter=rank');
            assert.equal(dom.window.history.state.marker, 'keep-router-state');
            assert.ok(!f.host.textContent?.includes('Bob'));
            dom.window.history.replaceState(dom.window.history.state, '', dom.window.location.pathname);
            // eslint-disable-next-line no-await-in-loop
            await act(async () => dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')));
            assert.equal(input.value, allowTeam ? '所有参赛者' : '全部用户');
            assert.ok(f.host.textContent?.includes('Bob'));
        // eslint-disable-next-line no-await-in-loop
        } finally { await f.close(); }
    }
});

test('stale scoreboard filters restore all rows and keep the displayed filter and history metadata consistent', async () => {
    const f = await fixture('contest_scoreboard', {}, {}, {
        tdoc: { docId: 'stale-filter' }, groups: [],
        rows: [[{ type: 'user' }, { type: 'rank' }],
            [{ type: 'user', raw: 4, value: 'Alice' }, { type: 'rank', value: 1 }],
            [{ type: 'user', raw: 5, value: 'Bob' }, { type: 'rank', value: 2 }]],
    }, { _id: 2 });
    try {
        for (const value of ['4', 'missing-group', '4,5']) {
            dom.window.history.replaceState({ marker: 'keep-router-state' }, '', `#filter=${value}`);
            // eslint-disable-next-line no-await-in-loop
            await act(async () => dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')));
            assert.equal(f.host.querySelector<HTMLInputElement>('input[aria-label="Filter participants"]')?.value, 'All Users');
            assert.equal(f.host.querySelectorAll('tbody tr').length, 2);
            assert.equal(dom.window.location.hash, '#filter=all');
            assert.equal(dom.window.history.state.marker, 'keep-router-state');
        }
    } finally { await f.close(); }
});

test('live scoreboard hides user and member profile links only from ordinary contestants', async () => {
    const now = Date.now();
    for (const state of [{ canEdit: false, ended: false }, { canEdit: true, ended: false }, { canEdit: false, ended: true }]) {
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture('contest_scoreboard', {}, {}, {
            tdoc: { docId: 'profile-links', allowTeam: true, beginAt: new Date(now - 60_000).toISOString(),
                endAt: new Date(now + (state.ended ? -1000 : 60_000)).toISOString() },
            canEdit: state.canEdit,
            udict: { 4: { _id: 4, uname: 'Alice' }, 5: { _id: 5, uname: 'Bob' },
                '-1000': { isTeam: true, displayName: 'Team', teamMembers: [4, 5] } },
            rows: [[{ type: 'user' }, { type: 'rank' }],
                [{ type: 'user', raw: 4, value: 'Alice' }, { type: 'rank', value: 1 }],
                [{ type: 'user', raw: 5, value: 'Bob' }, { type: 'rank', value: 2 }],
                [{ type: 'user', raw: -1000, value: 'Team' }, { type: 'rank', value: 3 }]],
        }, { _id: 4 });
        try {
            assert.equal(f.host.querySelectorAll('a[href="/user_detail"]').length, state.canEdit || state.ended ? 4 : 0);
            assert.ok(f.host.textContent?.includes('Alice'));
            assert.ok(f.host.textContent?.includes('Bob'));
            assert.ok(f.host.textContent?.includes('Team'));
        // eslint-disable-next-line no-await-in-loop
        } finally { await f.close(); }
    }
});

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

test('team-enabled contest registration asks before posting and keeps personal-only registration direct', async () => {
    const contest = { _id: '123', title: 'Contest', rule: 'acm', endAt: new Date(Date.now() + 3600000).toISOString() };
    const f = await fixture('contest_detail', {}, {}, {
        tdoc: { ...contest, allowTeam: true, _code: 'secret', content: '\n<!-- empty -->\n' },
        team_vdocs: [{ _id: -1000, displayName: 'My team' }],
    }, { _id: 2 });
    const click = async (text: string) => act(async () => {
        [...document.querySelectorAll('button')].find((button) => button.textContent === text)!.click();
    });
    try {
        assert.ok(f.host.textContent?.includes('No contest introduction yet.'));
        assert.equal(f.host.querySelector('select'), null);
        assert.ok(!f.host.textContent?.includes('Manage Teams'));
        await f.input(0, 'secret');
        await click('Register Contest');
        assert.equal(f.calls.length, 0);
        assert.ok(document.querySelector('[role="dialog"]'));
        await click('Cancel');
        assert.equal(f.calls.length, 0);
        await click('Register Contest');
        await click('Confirm');
        assert.deepEqual(JSON.parse(f.calls[0].init.body), { operation: 'attend', code: 'secret' });
        await click('Register Contest');
        await act(async () => {
            const select = document.querySelector('select')!;
            select.value = '-1000';
            select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        await click('Confirm');
        assert.deepEqual(JSON.parse(f.calls[1].init.body), { operation: 'attend', code: 'secret', vuid: -1000 });
        assert.equal(f.calls[1].url, 'https://oj.example/d/team/contest/123');
    } finally { await f.close(); }
    const personal = await fixture('contest_detail', {}, {}, { tdoc: { ...contest, content: ' \n\t ' } }, { _id: 2 });
    try {
        assert.ok(personal.host.textContent?.includes('No contest introduction yet.'));
        await click('Register Contest');
        assert.deepEqual(JSON.parse(personal.calls[0].init.body), { operation: 'attend', code: '' });
        assert.equal(document.querySelector('[role="dialog"]'), null);
    } finally { await personal.close(); }
});

test('contest problem rows stretch native links while preserving domain, contest context and record actions', async () => {
    for (const domainId of ['system', 'team']) {
        const args = {
            tdoc: { docId: 'contest-123', title: 'Contest', pids: [10, 11], beginAt: new Date(), endAt: new Date(Date.now() + 60_000) },
            pdict: { 10: { title: 'A+B', config: { type: 'default' } }, 11: { title: 'Choice', config: { type: 'objective' } } },
            psdict: { 10: { rid: 'record-123' } }, rdict: { 'record-123': { _id: 'record-123', status: 1 } }, showScore: true,
        };
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture('contest_detail', { domainId }, {}, args, { _id: 2 }, {}, 'contest_problemlist');
        try {
            const rows = [...f.host.querySelectorAll('.hydro-contest-problem-row')];
            assert.equal(rows.length, 2);
            const prefix = domainId === 'system' ? '' : '/d/team';
            const problem = rows[0].querySelector<HTMLAnchorElement>('.hydro-contest-problem-row__link')!;
            assert.equal(problem.getAttribute('href'), `${prefix}/p/10?tid=contest-123`);
            assert.match(problem.textContent!, /A\. A\+B/);
            const actions = [...rows[0].querySelectorAll<HTMLAnchorElement>('.hydro-contest-problem-row__action')];
            assert.ok(actions.some((link) => link.getAttribute('href') === `${prefix}/record/record-123`));
            assert.ok(actions.some((link) => link.getAttribute('href') === problem.getAttribute('href')));
            assert.equal(rows[1].querySelector('a')?.getAttribute('href'), `${prefix}/p/11?tid=contest-123`);
            assert.equal(problem.tabIndex, 0, 'the native row link remains keyboard accessible');
        // eslint-disable-next-line no-await-in-loop
        } finally { await f.close(); }
    }
});

test('team page replaces pending invites with a case-insensitive invitation-code join form', async () => {
    const f = await fixture('contest_team', {}, {}, { mine: [], invites: [{ _id: -1, displayName: 'Old invitation' }] }, { _id: 2 });
    try {
        assert.ok(f.host.textContent?.includes('Join a Team'));
        assert.ok(!f.host.textContent?.includes('Old invitation'));
        await f.input(0, 'abcdefgh');
        assert.equal([...f.host.querySelectorAll<HTMLInputElement>('.hydro-invitation-code input')].map((input) => input.value).join(''), 'ABCDEFGH');
        await f.submit();
        assert.deepEqual(JSON.parse(f.calls[0].init.body), { operation: 'join', code: 'ABCDEFGH' });
        assert.equal(f.calls[0].url, 'https://oj.example/d/team/contest/team');
        assert.deepEqual(f.navigations, ['/d/team/contest/team']);
        assert.equal(f.host.querySelector('input')!.value, '');
    } finally { await f.close(); }
});

test('team cards offer code copy and require confirmation before a reset', async () => {
    const f = await fixture('contest_team', {}, {}, {
        mine: [{ _id: -1000, displayName: 'Team', captainId: 2, canManage: true, canLeave: true, members: [2], invitationCode: 'ABCDEFGH' }],
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
    const member = await fixture('contest_team', {}, {}, {
        mine: [{ _id: -1000, displayName: 'Team', captainId: 2, canManage: false, canLeave: true, members: [2, 3], invitationCode: 'ABCDEFGH' }],
    }, { _id: 3 });
    try {
        assert.equal(member.host.querySelector('[aria-label="Reset team invitation code"]'), null);
        assert.equal(member.host.querySelector('[aria-label="Remove Member"]'), null);
        assert.ok(![...member.host.querySelectorAll('button')].some((button) => button.textContent === 'Rename'));
        assert.ok([...member.host.querySelectorAll('button')].some((button) => button.textContent === 'Leave Team' && !button.disabled));
        assert.match(member.host.textContent!, /ABCDEFGH/);
    } finally { await member.close(); }
});

test('rejected team code requests keep the code and display an error notification', async () => {
    const f = await fixture('contest_team', {}, { error: { message: 'Invalid invitation code' } }, {}, { _id: 2 });
    try {
        await f.input(0, 'ABCDEFGH');
        await f.submit();
        assert.equal(f.notices[0].color, 'red');
        assert.equal([...f.host.querySelectorAll<HTMLInputElement>('.hydro-invitation-code input')].map((input) => input.value).join(''), 'ABCDEFGH');
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
        assert.equal([...f.host.querySelectorAll<HTMLInputElement>('.hydro-invitation-code input')].map((input) => input.value).join(''), 'ABCDEFGH');
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
