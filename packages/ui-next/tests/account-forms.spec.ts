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
        './contest-detail.css': {},
        './ranking.css': {},
        '@mantine/core': mantine,
        '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
        '@/components/common/button': { Button: mantine.Button, ActionIcon: mantine.ActionIcon },
        '@/components/common/delete-resource-button': { DeleteResourceButton: () => null },
        '@/components/common/select': {
            ShortSelect: () => null,
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

test('managed user names open the editor and the profile form preserves drafts, sudo redirects and scoped back links', async () => {
    const list = await fixture('manage_user', {}, {}, { page: 3, q: 'student', udocs: [{ _id: 42, uname: 'student', canEditProfile: true }] });
    try {
        assert.ok(list.host.querySelector('a[href="/d/team/manage/users/42?page=3&q=student"]'));
        assert.equal(list.host.querySelector('a[href^="/user_detail"]'), null);
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
