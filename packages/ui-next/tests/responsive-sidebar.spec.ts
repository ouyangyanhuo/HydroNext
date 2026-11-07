import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { after, test } from 'node:test';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}

let mobileMatches = false;
dom.window.matchMedia = (query: string) => ({
    matches: mobileMatches,
    media: query,
    addEventListener() {},
    removeEventListener() {},
});

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

const path = fileURLToPath(new URL('../src/components/common/responsive-sidebar.tsx', import.meta.url));
const built = buildSync({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    alias: {
        '@/components/common/button': fileURLToPath(new URL('../src/components/common/button.tsx', import.meta.url)),
        '@/hooks/use-i18n': fileURLToPath(new URL('../src/hooks/use-i18n.ts', import.meta.url)),
    },
});

const module = { exports: {} as any };
runInNewContext(built.outputFiles[0].text, {
    module,
    exports: module.exports,
    window: dom.window,
    document: dom.window.document,
    URL,
    URLSearchParams,
    require: (id: string) => {
        if (id === '@/hooks/use-i18n') return { useI18n: () => ({ t: (k: string) => k }) };
        return require(id);
    },
});
const { ResponsiveSidebar } = module.exports;

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

test('responsive sidebar renders desktop container on desktop view and keeps action sheet closed', async () => {
    mobileMatches = false;
    const view = await mount(
        h(ResponsiveSidebar, { className: 'test-sidebar-desktop', title: 'Problem Actions' },
            h('button', { 'data-testid': 'action-btn' }, 'Submit Solution'),
        ),
    );
    try {
        const desktopContainer = view.host.querySelector('.test-sidebar-desktop');
        assert.ok(desktopContainer, 'Desktop container must exist in DOM');
        assert.match(desktopContainer.className, /hidden lg:block/, 'Desktop container must have hidden lg:block class');
        assert.ok(desktopContainer.querySelector('[data-testid="action-btn"]'), 'Children must render in desktop container');
    } finally {
        await view.close();
    }
});

test('responsive sidebar in mobile view renders floating ball and opens action sheet on click', async () => {
    mobileMatches = true;
    const view = await mount(
        h(ResponsiveSidebar, { className: 'test-sidebar-mobile', title: 'Problem Actions' },
            h('button', { 'data-testid': 'mobile-action-btn' }, 'Submit Solution'),
        ),
    );
    try {
        const fab = view.host.querySelector('.hydro-floating-sidebar-ball') as HTMLButtonElement | null;
        assert.ok(fab, 'Floating action ball must be rendered');
        assert.equal(fab.getAttribute('aria-label'), 'Problem Actions');

        // Click FAB to open Action Sheet
        await act(async () => {
            fab.click();
        });

        // Content should now be visible in document (Mantine Drawer portal)
        const contentInSheet = document.querySelector('[data-testid="mobile-action-btn"]');
        assert.ok(contentInSheet, 'Action sheet must display sidebar content after clicking FAB');
        assert.equal(contentInSheet.textContent, 'Submit Solution');

        // Check for Action Sheet header title
        assert.match(document.body.textContent || '', /Problem Actions/, 'Action sheet must render title in header');

        // Close button must exist
        const closeBtn = document.querySelector('.mantine-CloseButton-root') as HTMLButtonElement | null;
        assert.ok(closeBtn, 'Close button must exist in Action Sheet header');

        await act(async () => {
            closeBtn.click();
        });
    } finally {
        await view.close();
        mobileMatches = false;
    }
});

test('tailwind.css defines styling for floating sidebar ball and action sheet', () => {
    const css = readFileSync(new URL('../src/styles/tailwind.css', import.meta.url), 'utf8');
    const parsed = postcss.parse(css);
    let hasBall = false;
    let hasSheet = false;

    parsed.walkRules((rule) => {
        if (rule.selector.includes('.hydro-floating-sidebar-ball')) hasBall = true;
        if (rule.selector.includes('.hydro-action-sheet-content')) hasSheet = true;
    });

    assert.ok(hasBall, 'tailwind.css must define .hydro-floating-sidebar-ball');
    assert.ok(hasSheet, 'tailwind.css must define .hydro-action-sheet-content');
});
