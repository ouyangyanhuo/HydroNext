import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { after, test } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
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
const path = fileURLToPath(new URL('../src/components/user/user-link.tsx', import.meta.url));
const built = buildSync({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    external: ['@/components/link', '@/hooks/use-i18n', '@/utils/user-name'],
});
const module = { exports: {} as any };
runInNewContext(built.outputFiles[0].text, {
    ...globalThis,
    URL,
    Set,
    Map,
    module,
    exports: module.exports,
    document: dom.window.document,
    window: dom.window,
    require: (id: string) => {
        if (id === '@/hooks/use-i18n') return { useI18n: () => ({ t: (key: string) => key }) };
        if (id === '@/components/link') {
            return {
                Link: ({ children, className, title, to, params, ...props }: any) =>
                    h('a', { className, title, 'data-to': to, 'data-uid': params?.uid, ...props }, children),
            };
        }
        if (id === '@/utils/user-name') {
            const { formatUserName } = require('../src/utils/user-name.ts');
            return { formatUserName };
        }
        return require(id);
    },
});
const { UserLink } = module.exports;

async function mount(element: any) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(MantineProvider, null, element)));
    return {
        host,
        async close() {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

test('UserLink renders user link with formatted name', async () => {
    const view = await mount(h(UserLink, { user: { _id: 1, uname: 'admin', displayName: 'Administrator' } }));
    const a = view.host.querySelector('a');
    assert.ok(a);
    assert.equal(a.getAttribute('data-to'), 'user_detail');
    assert.equal(a.getAttribute('data-uid'), '1');
    assert.match(a.textContent, /Administrator \(admin\)/);
    await view.close();
});

test('UserLink supports truncate and title tooltip', async () => {
    const view = await mount(h(UserLink, {
        user: { _id: 2, uname: 'adm', displayName: 'admin123' },
        truncate: true,
        maxWidth: 120,
        className: 'max-w-[110px]',
    }));
    const a = view.host.querySelector('a');
    assert.ok(a);
    assert.ok(a.className.includes('truncate'));
    assert.ok(a.className.includes('inline-block'));
    assert.equal(a.getAttribute('title'), 'admin123 (adm)');
    const text = a.querySelector('.mantine-Text-root');
    assert.ok(text);
    assert.ok(text.className.includes('truncate'));
    assert.ok(text.className.includes('max-w-[110px]'));
    await view.close();
});

test('UserLink falls back to Unknown when user is invalid', async () => {
    const view = await mount(h(UserLink, { user: { _id: 0, uname: '' } }));
    assert.equal(view.host.querySelector('a'), null);
    assert.match(view.host.textContent, /Unknown/);
    await view.close();
});
