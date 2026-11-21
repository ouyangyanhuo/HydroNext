import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { protectedAccessHeaders, registerRequestSecurity } from '../src/registry/request-security.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/team/record?page=2' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as any)[key];
    }
});

function fixture(isInjected: boolean) {
    const requests: { url: string, options: RequestInit }[] = [];
    const preserved: boolean[] = [];
    let data: any = { name: 'record_main', args: {}, url: '/d/team/record?page=2' };
    const setData = (update: any, preservePage = false) => {
        data = update(data);
        preserved.push(preservePage);
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/context/router.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    const mocks = {
        '../globals': {
            endpoints: ['https://oj.example/'], isInjected,
            FALLBACK_ROUTES: { home_settings: '/home/settings/:category', home_honor_frames: '/home/honor-frames' },
            routeMapStore: { getSnapshot: () => ({ record_main: '/record', record_detail: '/record/:rid' }), set() {} },
        },
        './page-data': { useSetPageData: () => setData },
        '../registry/request-security': { protectedAccessHeaders },
    };
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, history: dom.window.history,
        URL, AbortController, AbortSignal, console,
        require: (name: string) => mocks[name] || require(name),
        fetch: async (url: string, options: RequestInit) => {
            requests.push({ url, options });
            return { ok: true, headers: new Headers(), json: async () => ({ requestedUrl: url }) };
        },
    });
    let navigate: any;
    function Child() {
        navigate = module.exports.useNavigate();
        return null;
    }
    const container = dom.window.document.createElement('div');
    const root = createRoot(container);
    return {
        requests, preserved, getData: () => data,
        navigate: (url: string, options?: any) => navigate(url, options),
        mount: () => act(async () => root.render(h(module.exports.RouterProvider, null, h(Child)))),
        unmount: () => act(async () => root.unmount()),
    };
}

test('URL-only editor mode updates preserve the page instance while real navigation and errors remount it', async () => {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/context/page-data.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    const mocks = {
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/hooks/use-permission': { PERM: { PERM_VIEW_RANKING: 1n, PERM_VIEW_CONTEST_SCOREBOARD: 2n }, hasPermValue: () => true },
        '@/registry/page-metadata': { getPageMetadata: () => ({ title: 'Problem' }) },
        '@/stores/domain-navigation-preview': { useDomainNavigationPreview: { getState: () => ({ preview: null }) } },
        '@/stores/session': { useSessionStore: { getState: () => ({ setSession() {}, ui: {}, user: {} }) } },
        '@/stores/route': {
            useRouteStore: Object.assign((select: any) => select({ setRouteMap() {} }), { getState: () => ({ setPage() {} }) }),
        },
        '@/utils/top-nav': require('../src/utils/top-nav.ts'),
    };
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, document: dom.window.document,
        require: (id: string) => mocks[id] || require(id),
    });
    let setData: any;
    let revision: number;
    function Probe() {
        setData = module.exports.useSetPageData();
        revision = module.exports.usePageDataRevision();
        return null;
    }
    const root = createRoot(dom.window.document.createElement('div'));
    const initial = { name: 'problem_detail', url: '/d/team/p/1', args: {} };
    try {
        await act(async () => root.render(h(module.exports.PageDataProvider, { initial }, h(Probe))));
        await act(async () => setData((data: any) => ({ ...data, url: '/d/team/p/1?mode=code' }), true));
        assert.equal(revision!, 0);
        await act(async () => setData((data: any) => ({ ...data, args: { refreshed: true } }), true));
        assert.equal(revision!, 0);
        await act(async () => setData((data: any) => ({ ...data, url: '/d/team/p/2', args: {} }), true));
        assert.equal(revision!, 1);
        await act(async () => setData((data: any) => ({ ...data, args: { error: 'Forbidden' } }), true));
        assert.equal(revision!, 2);
    } finally { await act(async () => root.unmount()); }
});

test('navigation, browser back/forward and bfcache restoration fetch uncached JSON without losing domain or query', async () => {
    dom.window.history.replaceState({}, '', '/d/team/record?page=2');
    const router = fixture(true);
    try {
        await router.mount();
        assert.equal(router.requests.length, 0);
        await act(async () => router.navigate('/d/team/record/123?tid=contest'));
        assert.equal(router.getData().name, 'record_detail');
        const length = dom.window.history.length;
        for (const direction of ['back', 'forward'] as const) {
            // eslint-disable-next-line no-await-in-loop
            await act(async () => {
                const changed = new Promise<void>((resolve) => dom.window.addEventListener('popstate', () => resolve(), { once: true }));
                dom.window.history[direction]();
                await changed;
            });
            assert.equal(router.getData().url, direction === 'back' ? '/d/team/record?page=2' : '/d/team/record/123?tid=contest');
            assert.equal(dom.window.history.length, length);
        }
        await act(async () => dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true })));
        assert.equal(router.requests.length, 4);
        for (const { url, options } of router.requests) {
            assert.ok(url.startsWith('https://oj.example/d/team/record'));
            assert.equal(options.cache, 'no-store');
            assert.equal(new Headers(options.headers).get('Accept'), 'application/json');
            assert.ok(new Headers(options.headers).get('x-hydro-inject')?.includes('usercontext'));
        }
        await act(async () => router.navigate(dom.window.location.href, { replace: true, preservePage: true }));
        assert.equal(router.preserved.at(-1), true);
        const editorUrl = '/d/team/p/P2?nav=list&page=3&mode=code';
        await act(async () => router.navigate(editorUrl));
        await act(async () => router.navigate('/d/team/record/123?submissionSource=editor'));
        await act(async () => {
            const changed = new Promise<void>((resolve) => dom.window.addEventListener('popstate', () => resolve(), { once: true }));
            dom.window.history.back();
            await changed;
        });
        assert.equal(router.getData().url, editorUrl, 'native back must restore the editor URL even for a smart-return record');
    } finally {
        await router.unmount();
    }
});

test('initial page-data loading also bypasses any old document/JSON cache entry', async () => {
    dom.window.history.replaceState({}, '', '/record?page=3');
    const router = fixture(false);
    try {
        await router.mount();
        assert.equal(router.requests.length, 1);
        assert.equal(router.requests[0].url, 'https://oj.example/record?page=3');
        assert.equal(router.requests[0].options.cache, 'no-store');
        assert.ok(new Headers(router.requests[0].options.headers).get('x-hydro-inject')?.includes('routemap'));
        assert.equal(router.getData().name, 'record_main');
    } finally {
        await router.unmount();
    }
});

test('contest problem navigation adds a fresh GET client proof without changing domain or tid', async () => {
    const signed: any[] = [];
    (dom.window as any).examAPI = { proctorHeaders: async (request: any) => {
        signed.push(request);
        return { 'x-proctor-token': 'token', 'x-proctor-proof': `proof-${signed.length}` };
    } };
    const router = fixture(true);
    const tid = '1234567890abcdef12345678';
    const dispose = registerRequestSecurity({
        accessHeaders: async (value: string) => {
            const target = new URL(value, dom.window.location.origin);
            return (dom.window as any).examAPI.proctorHeaders({ action: 'problem_view', method: 'GET', path: target.pathname,
                payload: { tid: target.searchParams.get('tid'), pid: target.pathname.split('/').at(-1) } });
        },
        submissionHeaders: async () => ({}), canRetry: () => true,
    });
    try {
        await router.mount();
        await act(async () => router.navigate(`/d/team/p/J0002?tid=${tid}`));
        assert.equal(signed[0].action, 'problem_view');
        assert.equal(signed[0].method, 'GET');
        assert.equal(signed[0].path, '/d/team/p/J0002');
        assert.equal(new Headers(router.requests[0].options.headers).get('x-proctor-proof'), 'proof-1');
        await act(async () => dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true })));
        assert.equal(new Headers(router.requests[1].options.headers).get('x-proctor-proof'), 'proof-2');
        assert.equal(router.getData().url, `/d/team/p/J0002?tid=${tid}`);
        (dom.window as any).examAPI.proctorHeaders = async () => { throw new Error('Old client'); };
        await act(async () => router.navigate(`/d/team/p/1?tid=${tid}`));
        // Server decides whether the route is protected; no fabricated proof or client flag.
        assert.equal(new Headers(router.requests[2].options.headers).get('x-proctor-token'), null);
    } finally {
        delete (dom.window as any).examAPI;
        dispose();
        await router.unmount();
    }
});

test('PageDataProvider coordinates View Transitions direction, rapid skip and cleanup', async () => {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/context/page-data.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    const mocks = {
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/hooks/use-permission': { PERM: { PERM_VIEW_RANKING: 1n, PERM_VIEW_CONTEST_SCOREBOARD: 2n }, hasPermValue: () => true },
        '@/registry/page-metadata': { getPageMetadata: () => ({ title: 'Page' }) },
        '@/stores/domain-navigation-preview': { useDomainNavigationPreview: { getState: () => ({ preview: null }) } },
        '@/stores/session': { useSessionStore: { getState: () => ({ setSession() {}, ui: {}, user: {} }) } },
        '@/stores/route': {
            useRouteStore: Object.assign((select: any) => select({ setRouteMap() {} }), { getState: () => ({ setPage() {} }) }),
        },
        '@/utils/top-nav': require('../src/utils/top-nav.ts'),
    };
    const previousHidden = Object.getOwnPropertyDescriptor(dom.window.document, 'hidden');
    Object.defineProperty(dom.window.document, 'hidden', { value: false, configurable: true });
    const transitions: { update: () => void, resolve: () => void, skipped: boolean, direction: string | undefined }[] = [];
    (dom.window.document as any).startViewTransition = (cb: () => void) => {
        const entry = {
            update: cb,
            resolve: () => {},
            skipped: false,
            direction: dom.window.document.documentElement.dataset.pageTransition,
        };
        const finished = new Promise<void>((resolve) => { entry.resolve = resolve; });
        transitions.push(entry);
        return {
            finished,
            skipTransition: () => { entry.skipped = true; },
        };
    };
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, document: dom.window.document,
        require: (id: string) => mocks[id] || require(id),
    });
    let setData: any;
    let transition: any;
    let currentUrl: string;
    function Probe() {
        setData = module.exports.useSetPageData();
        transition = module.exports.usePageTransition();
        currentUrl = module.exports.usePageData().url;
        return null;
    }
    const root = createRoot(dom.window.document.createElement('div'));
    const initial = { name: 'problem_main', url: '/d/team/p', args: {} };
    try {
        await act(async () => root.render(h(module.exports.PageDataProvider, { initial }, h(Probe))));
        // Opening /p directly may restore a saved sort. It must render without
        // waiting for a native snapshot or an asynchronous animation callback.
        await act(async () => setData({ ...initial, url: '/d/team/p?sort=recent' }));
        assert.equal(transitions.length, 0);
        assert.equal(currentUrl!, '/d/team/p?sort=recent');
        assert.equal(transition.viaViewTransition, false);

        await act(async () => setData({ name: 'contest_main', url: '/d/team/contest', args: {} }));
        assert.equal(transitions.length, 1);
        assert.equal(transitions[0].direction, 'from-right');
        assert.equal(dom.window.document.documentElement.dataset.pageTransition, 'from-right');
        // Rapid second navigation skips the first transition and preserves the newer direction until it finishes
        await act(async () => setData({ name: 'homepage', url: '/d/team/', args: {} }));
        assert.equal(transitions.length, 2);
        assert.equal(transitions[0].skipped, true);
        assert.equal(transitions[1].direction, 'from-left');
        assert.equal(dom.window.document.documentElement.dataset.pageTransition, 'from-left');
        await act(async () => transitions[1].update());
        assert.equal(transition.direction, 'from-left');
        assert.equal(transition.viaViewTransition, true);

        // A skipped transition's callback can still run and must not restore the old page.
        await act(async () => {
            transitions[0].update();
            transitions[0].resolve();
        });
        assert.equal(currentUrl!, '/d/team/');
        assert.equal(dom.window.document.documentElement.dataset.pageTransition, 'from-left');

        // Active transition completion clears data-page-transition cleanly
        transitions[1].resolve();
        await act(async () => { await Promise.resolve(); });
        assert.equal(dom.window.document.documentElement.dataset.pageTransition, undefined);
    } finally {
        if (previousHidden) Object.defineProperty(dom.window.document, 'hidden', previousHidden);
        else delete (dom.window.document as any).hidden;
        delete (dom.window.document as any).startViewTransition;
        delete dom.window.document.documentElement.dataset.pageTransition;
        await act(async () => root.unmount());
    }
});
