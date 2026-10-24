import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { contributionCalendar } from '../src/utils/contributions';

const addonMocks = {
    '@/components/common/addon-slots': {
        AccountMenuExtras: () => null, SettingsNavigationExtras: () => null,
        ProfileTabExtras: () => null, ProfilePanelExtras: () => null,
        RecordActionExtras: () => null, RecordContentExtras: () => null,
    },
    '@/components/user/avatar-view': { AvatarView: () => null },
    '@/registry/user-fields': { getUserExtensionFields: () => [] },
};
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/user/42', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    Document: dom.window.Document, ShadowRoot: dom.window.ShadowRoot,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
Object.defineProperty(dom.window.document, 'fonts', { value: { addEventListener() {}, removeEventListener() {} } });
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as any)[key];
    }
});

const { act, createElement: h } = require('react');
const { createRoot } = require('react-dom/client');
const { MantineProvider } = require('@mantine/core');
const locale = require('js-yaml').load(readFileSync(new URL('../locales/zh.yaml', import.meta.url), 'utf8'));
const t = (key: string, ...values: any[]) => values.reduce((text, value, index) => text.replaceAll(`{${index}}`, String(value)), locale[key] || key);

function component(filename: string, mocks: Record<string, any>) {
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
    const code = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    const module = { exports: {} as any };
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, URLSearchParams,
        require: (name: string) => mocks[name] ?? addonMocks[name] ?? require(name),
    });
    return module.exports;
}

const buttons = component('../src/components/common/button.tsx', {});
const selects = component('../src/components/common/select.tsx', {
    './select-styles': component('../src/components/common/select-styles.ts', {}),
});
const { ContributionCard } = component('../src/components/user/contribution-card.tsx', {
    './contribution-card.css': {},
    '@/components/common/button': buttons,
    '@/components/common/select': selects,
    '@/hooks/use-i18n': { useI18n: () => ({ t, language: 'zh' }) },
    '@/utils/contributions': { contributionCalendar },
});
const fixture = {
    today: '2026-10-15', timeZone: 'Asia/Shanghai',
    days: [{ date: '2024-02-29', count: 7 }, { date: '2026-10-15', count: 2 }],
    summary: { total: 9, lastYear: 2, lastMonth: 2, longestStreak: 1, lastYearLongestStreak: 1, lastMonthLongestStreak: 1 },
};

test('profile problem tags follow contribution history and preserve counts with responsive metric markup', async () => {
    const Profile = component('../src/pages/user_detail.tsx', {
        '@/components/common/button': buttons,
        '@/components/common/paginator': { Paginator: () => null },
        '@/components/common/time-display': { TimeDisplay: () => null },
        '@/components/link': { Link: ({ children }: any) => h('a', null, children) },
        '@/components/markdown/markdown-renderer': { MarkdownRenderer: () => null },
        '@/components/user/contribution-card': { ContributionCard },
        '@/components/user/owned-honor-frames': { OwnedHonorFrames: () => null },
        '@/components/user/user-avatar': { UserAvatar: () => null },
        '@/context/page-data': { usePageData: () => ({ args: {
            udoc: { _id: 42, uname: 'Ada' }, contributions: fixture,
            tags: [['binary search', 7], { name: 'DP', count: 4 }, { _id: '图论', count: 2 }],
        } }) },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/d/team/record' },
        '@/hooks/use-i18n': { useI18n: () => ({ t, language: 'zh' }) },
        '@/stores/session': { useSessionStore: (select: any) => select({ user: { _id: 0 } }) },
        '@/utils/user-name': { formatUserName: (user: any) => user.uname },
    }).default;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(h(MantineProvider, null, h(Profile))));
        const contribution = host.querySelector('.hydro-contributions')!;
        const tags = host.querySelector('.hydro-user-profile__tags')!;
        assert.equal(contribution.nextElementSibling, tags);
        assert.ok(tags.textContent.includes(t('Problem Tags')));
        assert.deepEqual([...tags.querySelectorAll('dt')].map((item) => item.textContent), ['binary search', 'DP', '图论']);
        assert.deepEqual([...tags.querySelectorAll('dd')].map((item) => item.textContent), ['7', '4', '2']);
        assert.equal(tags.querySelector('.mantine-Badge-root'), null);
        assert.ok(tags.querySelector('dl'));
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

async function mount(history = fixture) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(MantineProvider, { forceColorScheme: 'light' }, h(ContributionCard, { history }))));
    return {
        host,
        async close() {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

test('contribution card switches years without changing its six rolling and lifetime metrics', async () => {
    const view = await mount();
    try {
        const metrics = view.host.querySelector('.hydro-contributions__metrics')!;
        for (const label of [
            '历史累计解题数', '最近一年解题数', '最近一月解题数',
            '最长连续解题天数', '最近一年最长连续天数', '最近一月最长连续天数',
        ]) assert.ok(metrics.textContent.includes(label));
        const originalMetrics = metrics.textContent;
        const selector = view.host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
        assert.equal(selector.getAttribute('aria-label'), '贡献图年份');
        assert.ok(selector.closest('.hydro-select--short'));
        assert.equal(selector.value, '2026');
        await act(async () => selector.click());
        const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
        assert.deepEqual(options.map((option) => option.textContent), ['2026', '2025', '2024']);
        assert.equal(view.host.querySelectorAll('[data-date]').length, 365);
        assert.equal(view.host.querySelector<HTMLButtonElement>('[data-date="2026-10-16"]')!.disabled, true);
        await act(async () => options[2].click());
        assert.equal(selector.value, '2024');
        await act(async () => selector.click());
        await act(async () => (document.querySelector('[role="option"][data-checked]') as HTMLElement).click());
        assert.equal(selector.value, '2024', 'selecting the current year must not clear the selection');
        assert.equal(view.host.querySelectorAll('[data-date]').length, 366);
        assert.ok(view.host.textContent.includes('2024 年共解决 7 题'));
        assert.equal(metrics.textContent, originalMetrics);
        const leapDay = view.host.querySelector<HTMLButtonElement>('[data-date="2024-02-29"]')!;
        assert.equal(leapDay.dataset.level, '3');
        assert.equal(leapDay.hasAttribute('title'), false, 'native browser tooltips must not duplicate the system tooltip');
        await act(async () => leapDay.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })));
        assert.equal(document.querySelector('[role="tooltip"]')?.textContent, '2024-02-29：解决 7 题');
        assert.equal(document.querySelectorAll('[role="tooltip"]').length, 1);
        await act(async () => leapDay.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true })));
        assert.equal(document.querySelector('[role="tooltip"]'), null);
        await act(async () => leapDay.click());
        assert.equal(view.host.querySelector('[aria-live="polite"]')!.textContent, '2024-02-29：解决 7 题');
        await act(async () => leapDay.focus());
        assert.equal(document.querySelector('[role="tooltip"]')?.textContent, '2024-02-29：解决 7 题');
        await act(async () => leapDay.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
        assert.equal((document.activeElement as HTMLElement).dataset.date, '2024-03-01');
        await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
        assert.equal((document.activeElement as HTMLElement).dataset.date, '2024-01-01');
        await act(async () => leapDay.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })));
        assert.equal(view.host.querySelector('[aria-live="polite"]')!.textContent, '2024-02-29：解决 7 题');
        assert.equal(view.host.querySelector<HTMLButtonElement>('[data-date="2024-01-01"]')!.tabIndex, 0);
        assert.equal(view.host.querySelectorAll('[data-date][tabindex="0"]').length, 1);
    } finally { await view.close(); }
});

test('an empty contribution history renders a usable current-year calendar and zero metrics', async () => {
    const view = await mount({
        ...fixture, days: [],
        summary: { total: 0, lastYear: 0, lastMonth: 0, longestStreak: 0, lastYearLongestStreak: 0, lastMonthLongestStreak: 0 },
    });
    try {
        assert.ok(view.host.textContent.includes('还没有解题记录。'));
        assert.ok(view.host.textContent.includes('2026 年共解决 0 题'));
        const selector = view.host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
        assert.equal(selector.value, '2026');
        await act(async () => selector.click());
        assert.equal(document.querySelectorAll('[role="option"]').length, 1);
        assert.equal(view.host.querySelectorAll('[data-date]').length, 365);
        assert.equal(view.host.querySelectorAll('.hydro-contributions__metric').length, 6);
        assert.equal(view.host.querySelector<HTMLButtonElement>('[data-date="2026-10-15"]')!.tabIndex, 0);
    } finally { await view.close(); }
});
