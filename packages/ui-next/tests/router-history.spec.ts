import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { proctorAccessHeaders } from '../src/utils/proctor.ts';

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
    let data: any = { name: 'record_main', args: {}, url: '/d/team/record?page=2' };
    const setData = (update: any) => { data = update(data); };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/context/router.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    const mocks = {
        '../globals': {
            endpoints: ['https://oj.example/'], isInjected,
            routeMapStore: { getSnapshot: () => ({ record_main: '/record', record_detail: '/record/:rid' }), set() {} },
        },
        './page-data': { useSetPageData: () => setData },
        '../utils/proctor': { proctorAccessHeaders },
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
        requests, getData: () => data,
        navigate: (url: string) => navigate(url),
        mount: () => act(async () => root.render(h(module.exports.RouterProvider, null, h(Child)))),
        unmount: () => act(async () => root.unmount()),
    };
}

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
        await router.unmount();
    }
});
