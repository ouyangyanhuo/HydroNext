import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, beforeEach, test } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/', pretendToBeVisual: true });
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
beforeEach(() => dom.window.localStorage.clear());
after(async () => {
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

test('modals in problem_detail and contest_detail do not use centered layout', () => {
    const problemSource = readFileSync(new URL('../src/pages/problem_detail.tsx', import.meta.url), 'utf8');
    const relatedModalTag = problemSource.slice(problemSource.indexOf('opened={relatedOpened}')).split('>')[0];
    assert.equal(relatedModalTag.includes('centered'), false);

    const contestSource = readFileSync(new URL('../src/pages/contest_detail.tsx', import.meta.url), 'utf8');
    const registerModalTag = contestSource.slice(contestSource.indexOf('title={t(\'Register Contest\')}')).split('>')[0];
    assert.equal(registerModalTag.includes('centered'), false);
});

async function mountHomepage(
    args: any = {}, user: any = { _id: 0, perm: 0n }, perms: Record<string, boolean> = {}, realMenu = false, ui: any = {},
) {
    const state = { args, user, ui };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const testMenu: any = ({ children }: any) => h('div', { className: 'hydro-menu' }, children);
    testMenu.Target = ({ children }: any) => children;
    testMenu.Dropdown = ({ children }: any) => h('div', { className: 'hydro-menu-dropdown' }, children);
    testMenu.Item = ({ children, onClick, rightSection, fw, ...props }: any) => h('button', {
        type: 'button',
        className: 'hydro-menu-item',
        onClick,
        ...props,
    }, children, rightSection ? h('span', { className: 'hydro-menu-right-section' }, rightSection) : null);

    const mocks = {
        '@mantine/core': {
            ...mantine,
            Menu: realMenu ? mantine.Menu : testMenu,
        },
        '@/components/common/button': {
            Button: mantine.Button,
            ActionIcon: mantine.ActionIcon,
        },
        '@/components/common/time-display': { TimeDisplay: () => h('span', null, '1 hour ago') },
        '@/components/link': {
            Link: forwardRef(({ children, to, ...props }: any, ref: any) => h('a', { ...props, href: `/${to}`, ref }, children)),
        },
        '@/components/markdown/markdown-renderer': { MarkdownRenderer: () => null },
        '@/context/page-data': { usePageData: () => ({ args: state.args }) },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string, ...values: any[]) => key
            .replace(/\{(\d+)\}/g, (placeholder, index) => values[index] === undefined ? placeholder : String(values[index])) }) },
        '@/hooks/use-permission': {
            PERM: { PERM_VIEW_PROBLEM: 1n << 7n, PERM_VIEW_CONTEST: 1n << 41n },
            useHasPerm: (perm: bigint) => {
                if (perm === (1n << 7n)) return Boolean(perms.problem ?? false);
                if (perm === (1n << 41n)) return Boolean(perms.contest ?? false);
                return false;
            },
        },
        '@/stores/session': { useSessionStore: (select: any) => select({ ui: state.ui, user: state.user, language: 'zh' }) },
        '@/utils/i18n-content': { extractLocalizedContent: (c: any) => (typeof c === 'string' ? c : (c?.zh || c?.en || '')) },
        '@/utils/user-name': { formatUserName: (u: any) => u.uname || 'user' },
    };

    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/pages/homepage.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;

    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, document: dom.window.document,
        require: (id: string) => mocks[id] ?? require(id),
    });

    const HomePage = module.exports.default;
    await act(async () => {
        root.render(h(mantine.MantineProvider, null, h(HomePage)));
    });

    return {
        host,
        render: async (next: Partial<typeof state>) => {
            Object.assign(state, next);
            await act(async () => root.render(h(mantine.MantineProvider, null, h(HomePage))));
        },
        close: async () => {
            await act(async () => { root.unmount(); });
            host.remove();
        },
    };
}

test('guest welcome uses the configured website name as escaped text and falls back when absent', async () => {
    for (const serverName of ['My University OJ', '<img src=x onerror=alert(1)>', '']) {
        // eslint-disable-next-line no-await-in-loop
        const f = await mountHomepage({}, undefined, {}, false, { serverName });
        try {
            assert.equal(f.host.querySelector('#hydro-home-title')?.textContent, `Welcome to ${serverName || 'HydroNext'}`);
            assert.equal(f.host.querySelector('#hydro-home-title img'), null);
        } finally {
            // eslint-disable-next-line no-await-in-loop
            await f.close();
        }
    }
});

test('homepage sort buttons are hidden for unauthenticated users', async () => {
    const f = await mountHomepage({}, { _id: 0, perm: 0n });
    try {
        const sortButtons = f.host.querySelectorAll('button[aria-label^="Sort"]');
        assert.equal(sortButtons.length, 0);
    } finally {
        await f.close();
    }
});

test('homepage sort buttons are hidden when user lacks view permission', async () => {
    const f = await mountHomepage({}, { _id: 10, perm: 0n }, { problem: false, contest: false });
    try {
        const sortButtons = f.host.querySelectorAll('button[aria-label^="Sort"]');
        assert.equal(sortButtons.length, 0);
    } finally {
        await f.close();
    }
});

test('homepage sort hints use portal tooltips without breaking the real sorting menu', async () => {
    const f = await mountHomepage({}, { _id: 10, perm: 1n }, { problem: true, contest: true }, true);
    try {
        for (const label of ['Sort problem list', 'Sort recent contests']) {
            const button = f.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
            assert.ok(button);
            assert.equal(button.hasAttribute('title'), false);
            assert.equal(button.getAttribute('aria-haspopup'), 'menu');
            // eslint-disable-next-line no-await-in-loop
            await act(async () => {
                button.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
                button.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
                button.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true }));
            });
            // eslint-disable-next-line no-await-in-loop
            await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
            // eslint-disable-next-line no-await-in-loop
            await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
            const tooltip = [...document.querySelectorAll('[role="tooltip"]')].find((element) => element.textContent === label);
            assert.ok(tooltip, label);
            assert.equal(f.host.contains(tooltip), false, 'portal avoids clipping by homepage panels');
            // eslint-disable-next-line no-await-in-loop
            await act(async () => {
                button.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true }));
                button.dispatchEvent(new dom.window.MouseEvent('mouseleave'));
            });
        }
        const button = f.host.querySelector<HTMLButtonElement>('button[aria-label="Sort problem list"]')!;
        await act(async () => button.click());
        assert.equal(button.getAttribute('aria-expanded'), 'true');
        await act(async () => new Promise((resolve) => setTimeout(resolve, 150)));
        const option = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
            .find((item) => item.textContent?.includes('Most attempted'))!;
        assert.ok(option);
        await act(async () => option.click());
        assert.equal(f.host.querySelector('#problem-list-title')?.textContent, 'Most Attempted Problems');
        assert.equal(button.getAttribute('aria-expanded'), 'false');
    } finally { await f.close(); }
});

test('homepage problem list sorting reorders items and updates card title', async () => {
    const contents = [
        {
            sections: [
                ['problems', [
                    [
                        { docId: 1, pid: 'P1001', title: 'Problem A', nSubmit: 5, nAccept: 1 },
                        { docId: 2, pid: 'P1002', title: 'Problem B', nSubmit: 50, nAccept: 20 },
                        { docId: 3, pid: 'P1003', title: 'Problem C', nSubmit: 10, nAccept: 5 },
                    ],
                    {
                        1: { docId: 1, status: 2, score: 30 },
                        2: { docId: 2, status: 1, score: 100 },
                    },
                ]],
            ],
        },
    ];

    const f = await mountHomepage({ contents }, { _id: 10, perm: 1n }, { problem: true, contest: true });
    try {
        const sortBtn = f.host.querySelector('button[aria-label="Sort problem list"]');
        assert.ok(sortBtn);

        // Default order check
        const titleEl = f.host.querySelector('#problem-list-title');
        assert.equal(titleEl?.textContent, 'Problem List');
        let rows = [...f.host.querySelectorAll('.hydro-problem-row .hydro-data-row__id')].map((el) => el.textContent);
        assert.deepEqual(rows, ['P1001', 'P1002', 'P1003']);

        const menuItems = [...f.host.querySelectorAll('.hydro-data-panel--problems .hydro-menu-item')];
        const hotItem = menuItems.find((el) => el.textContent?.includes('Most attempted'));
        const recentItem = menuItems.find((el) => el.textContent?.includes('Recently attempted'));
        const defaultItem = menuItems.find((el) => el.textContent?.includes('Default order'));

        assert.ok(hotItem);
        assert.ok(recentItem);
        assert.ok(defaultItem);

        // Sort by hot (most attempted)
        await act(async () => {
            hotItem.click();
        });
        assert.equal(titleEl?.textContent, 'Most Attempted Problems');
        rows = [...f.host.querySelectorAll('.hydro-problem-row .hydro-data-row__id')].map((el) => el.textContent);
        assert.deepEqual(rows, ['P1002', 'P1003', 'P1001']);

        // Sort by recent (unsolved first)
        await act(async () => {
            recentItem.click();
        });
        assert.equal(titleEl?.textContent, 'Recently Attempted Problems');
        rows = [...f.host.querySelectorAll('.hydro-problem-row .hydro-data-row__id')].map((el) => el.textContent);
        assert.deepEqual(rows, ['P1001', 'P1002', 'P1003']);

        // Switch back to default
        await act(async () => {
            defaultItem.click();
        });
        assert.equal(titleEl?.textContent, 'Problem List');
    } finally {
        await f.close();
    }
});

test('homepage contest sorting reorders items and updates card title', async () => {
    const now = Date.now();
    const contents = [
        {
            sections: [
                ['contest', [
                    [
                        {
                            docId: 'c1', _id: 'c1', title: 'Finished Contest', attend: 100,
                            beginAt: new Date(now - 7200000).toISOString(),
                            endAt: new Date(now - 3600000).toISOString(),
                        },
                        {
                            docId: 'c2', _id: 'c2', title: 'Upcoming Contest', attend: 10,
                            beginAt: new Date(now + 3600000).toISOString(),
                            endAt: new Date(now + 7200000).toISOString(),
                        },
                        {
                            docId: 'c3', _id: 'c3', title: 'Running Contest', attend: 50,
                            beginAt: new Date(now - 1800000).toISOString(),
                            endAt: new Date(now + 1800000).toISOString(),
                        },
                        {
                            docId: 'c4', _id: 'c4', title: 'Popular unjoined contest', attend: 1000,
                            beginAt: new Date(now - 1800000).toISOString(),
                            endAt: new Date(now + 1800000).toISOString(),
                        },
                    ],
                    {
                        c1: { attend: true },
                        c2: { attend: true },
                        c3: { attend: true, uid: -1000, members: [10] },
                        c4: { attend: 0 },
                    },
                ]],
            ],
        },
    ];

    const f = await mountHomepage({ contents }, { _id: 10, perm: 1n }, { problem: true, contest: true });
    try {
        const sortBtn = f.host.querySelector('button[aria-label="Sort recent contests"]');
        assert.ok(sortBtn);

        const titleEl = f.host.querySelector('#recent-contests-title');
        assert.equal(titleEl?.textContent, 'Recent Contests');

        const menuItems = [...f.host.querySelectorAll('.hydro-data-panel:not(.hydro-data-panel--problems) .hydro-menu-item')];
        const hotItem = menuItems.find((el) => el.textContent?.includes('Most attended'));
        const joinedItem = menuItems.find((el) => el.textContent?.includes('Contests I joined'));

        assert.ok(hotItem);
        assert.ok(joinedItem);

        // Sort by hot (most attended)
        await act(async () => {
            hotItem.click();
        });
        assert.equal(titleEl?.textContent, 'Most Attended Contests');
        let titles = [...f.host.querySelectorAll('.hydro-contest-card-row__title')].map((el) => el.textContent);
        assert.deepEqual(titles, ['Popular unjoined contest', 'Finished Contest', 'Running Contest', 'Upcoming Contest']);

        // Sort by joined (running -> upcoming -> finished)
        await act(async () => {
            joinedItem.click();
        });
        assert.equal(titleEl?.textContent, 'Contests I Joined');
        titles = [...f.host.querySelectorAll('.hydro-contest-card-row__title')].map((el) => el.textContent);
        assert.deepEqual(titles, ['Running Contest', 'Upcoming Contest', 'Finished Contest']);
        await f.render({ args: { contents: [{ sections: [['contest', [(contents[0].sections[0][1] as any)[0], {}]]] }] } });
        assert.equal(f.host.querySelectorAll('.hydro-contest-card-row').length, 0);
        assert.match(f.host.querySelector('[aria-labelledby="recent-contests-title"]')!.textContent!, /No contests found/);
    } finally {
        await f.close();
    }
});

test('homepage remembers both sort preferences on reload and isolates accounts and domains during SPA navigation', async () => {
    const user = { _id: 10, perm: 1n };
    const permissions = { problem: true, contest: true };
    let f = await mountHomepage({}, user, permissions, false, { domainId: 'a' });
    try {
        const problemHot = [...f.host.querySelectorAll('.hydro-data-panel--problems .hydro-menu-item')]
            .find((item) => item.textContent === 'Most attempted')!;
        const joined = [...f.host.querySelectorAll('[aria-labelledby="recent-contests-title"] .hydro-menu-item')]
            .find((item) => item.textContent === 'Contests I joined')!;
        await act(async () => {
            problemHot.click();
            joined.click();
        });
        await f.close();
        f = await mountHomepage({}, user, permissions, false, { domainId: 'a' });
        assert.equal(f.host.querySelector('#problem-list-title')!.textContent, 'Most Attempted Problems');
        assert.equal(f.host.querySelector('#recent-contests-title')!.textContent, 'Contests I Joined');
        await f.render({ ui: { domainId: 'b' } });
        assert.equal(f.host.querySelector('#problem-list-title')!.textContent, 'Problem List');
        assert.equal(f.host.querySelector('#recent-contests-title')!.textContent, 'Recent Contests');
        await f.render({ ui: { domainId: 'a' } });
        assert.equal(f.host.querySelector('#problem-list-title')!.textContent, 'Most Attempted Problems');
        assert.equal(f.host.querySelector('#recent-contests-title')!.textContent, 'Contests I Joined');
        await f.render({ user: { _id: 11, perm: 1n } });
        assert.equal(f.host.querySelector('#problem-list-title')!.textContent, 'Problem List');
        assert.equal(f.host.querySelector('#recent-contests-title')!.textContent, 'Recent Contests');
        await f.render({ user: { _id: 0, perm: 0n } });
        assert.equal(f.host.querySelectorAll('button[aria-label^="Sort"]').length, 0);
    } finally { await f.close(); }
});

test('invalid stored preferences fall back safely and blocked storage does not prevent changing sort order', async () => {
    const storage = Object.getOwnPropertyDescriptor(dom.window, 'localStorage')!;
    dom.window.localStorage.setItem('hydro:homepage-sort:v1:problem:10:a', 'joined');
    dom.window.localStorage.setItem('hydro:homepage-sort:v1:contest:10:a', 'recent');
    const user = { _id: 10, perm: 1n };
    const permissions = { problem: true, contest: true };
    let f = await mountHomepage({}, user, permissions, false, { domainId: 'a' });
    try {
        assert.equal(f.host.querySelector('#problem-list-title')!.textContent, 'Problem List');
        assert.equal(f.host.querySelector('#recent-contests-title')!.textContent, 'Recent Contests');
        await f.close();
        Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
        f = await mountHomepage({}, user, permissions, false, { domainId: 'a' });
        const hot = [...f.host.querySelectorAll('.hydro-data-panel--problems .hydro-menu-item')]
            .find((item) => item.textContent === 'Most attempted')!;
        await act(async () => hot.click());
        assert.equal(f.host.querySelector('#problem-list-title')!.textContent, 'Most Attempted Problems');
    } finally {
        Object.defineProperty(dom.window, 'localStorage', storage);
        await f.close();
    }
});
