import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { isChunkLoadError } from '../src/utils/chunk-load-error.ts';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(path: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, require: (name: string) => mocks[name] || require(name), ...globals,
    });
    return module.exports;
}

test('asset failures across browsers and CSS preload are distinguished from application bugs', () => {
    for (const message of [
        'Failed to fetch dynamically imported module: https://oj.example/assets/page-old.js',
        'error loading dynamically imported module: https://oj.example/assets/page-old.js',
        'Importing a module script failed.', 'Loading chunk 123 failed.', 'Unable to preload CSS for /assets/page.css',
    ]) assert.equal(isChunkLoadError(new TypeError(message)), true);
    assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: 'Missing module' }), true);
    for (const error of [null, new Error('Failed to fetch'), new Error('Cannot read properties of null'), new SyntaxError('Unexpected token')]) {
        assert.equal(isChunkLoadError(error), false);
    }
});

test('reload notice requires a user action and keeps the current domain, path, query and hash', () => {
    let reloads = 0;
    const location = { href: 'https://oj.example/d/team/manage/dashboard?page=2#runtime', reload: () => { reloads += 1; } };
    const { ChunkLoadErrorNotice } = load('../src/components/feedback/chunk-load-error-notice.tsx', {
        '@/components/common/button': { ButtonBase: 'button' },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    }, { window: { location } });
    const element = ChunkLoadErrorNotice();
    const html = renderToStaticMarkup(element);
    assert.match(html, /role="alert"/);
    assert.match(html, /Save unfinished work before reloading/);
    assert.match(html, /Reload page/);
    assert.equal(reloads, 0);
    element.props.children.at(-1).props.onClick();
    assert.equal(reloads, 1);
    assert.equal(location.href, 'https://oj.example/d/team/manage/dashboard?page=2#runtime');
});

test('slot boundary offers reload only for chunk loading failures and keeps real bug diagnostics', () => {
    const ChunkLoadErrorNotice = () => React.createElement('div', {}, 'Reload notice');
    const { SlotErrorBoundary } = load('../src/registry/error-boundary.tsx', {
        '../components/feedback/chunk-load-error-notice': { ChunkLoadErrorNotice },
        '../utils/chunk-load-error': { isChunkLoadError },
    });
    const boundary = new SlotErrorBoundary({ slotName: 'page:manage_dashboard', label: 'renderer', children: 'Healthy page' });
    assert.equal(boundary.render(), 'Healthy page');
    boundary.state = SlotErrorBoundary.getDerivedStateFromError(new TypeError('Failed to fetch dynamically imported module: /assets/old.js'));
    assert.equal(boundary.render().type, ChunkLoadErrorNotice);
    boundary.state = SlotErrorBoundary.getDerivedStateFromError(new Error('Cannot read properties of null'));
    const html = renderToStaticMarkup(boundary.render());
    assert.match(html, /Slot Error/);
    assert.match(html, /Cannot read properties of null/);
    assert.doesNotMatch(html, /Reload notice/);
});

async function rendererFixture(dev = false) {
    let renderer: any;
    let html = '<html><script src="/assets/index-first.js"></script><!-- __HYDRO_INJECTION__DO_NOT_REMOVE_THIS__ --></html>';
    let exists = true;
    const connect = () => () => {};
    const { apply } = load('../index.ts', {
        fs: { existsSync: () => exists, readFileSync: () => html },
        esbuild: {}, 'koa2-connect/ts': connect,
        vite: { createServer: async () => ({ middlewares() {}, transformIndexHtml: async (_url: string, value: string) => value }) },
        '@hydrooj/framework': { serializer: () => undefined },
        hydrooj: { Handler: class {}, Logger: class {}, Types: {}, param: () => () => {} },
        './build-identifier': { resolveBuildIdentifier: () => 'test-build', resolveBuildTime: () => '2026-10-08T00:00:00Z' },
    }, { __dirname: '/ui-next', process: { env: dev ? { DEV: '1' } : {}, cwd: () => '/hydrooj' },
        global: { Hydro: { version: { hydrooj: 'test' } } } });
    await apply({
        setting: { get: () => '' }, Route() {}, on() {}, debounce: () => () => {},
        server: { routeMap: { manage_dashboard: '/manage/dashboard' }, addCaptureRoute() {},
            registerRenderer: (_name: string, value: any) => { renderer = value; } },
    });
    const headers = new Map<string, string>();
    const context = { handler: { session: {}, UiContext: {}, context: { req: { url: '/d/team/manage/dashboard' } },
        response: { addHeader: (name: string, value: string) => headers.set(name, value) } } };
    return { renderer, headers, context,
        setHtml: (value: string) => { html = value; }, setExists: (value: boolean) => { exists = value; } };
}

test('production renderer never caches HTML and reads the current hashed entry on every render', async () => {
    const api = await rendererFixture();
    assert.match(await api.renderer.render('manage_dashboard.html', {}, api.context), /index-first\.js/);
    assert.equal(api.headers.get('Cache-Control'), 'no-store');
    api.setHtml('<html><script src="/assets/index-second.js"></script><!-- __HYDRO_INJECTION__DO_NOT_REMOVE_THIS__ --></html>');
    assert.match(await api.renderer.render('manage_dashboard.html', {}, api.context), /index-second\.js/);
    api.setExists(false);
    assert.match(await api.renderer.render('manage_dashboard.html', {}, api.context), /building/);
    assert.equal(api.headers.get('Cache-Control'), 'no-store');
});

test('development renderer also keeps its HTML private and uncached', async () => {
    const api = await rendererFixture(true);
    await api.renderer.render('manage_dashboard.html', {}, api.context);
    assert.equal(api.headers.get('Cache-Control'), 'no-store');
});
