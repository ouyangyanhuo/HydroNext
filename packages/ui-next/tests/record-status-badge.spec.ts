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
const path = fileURLToPath(new URL('../src/components/record/record-status-badge.tsx', import.meta.url));
const built = buildSync({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
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
        return require(id);
    },
});
const { RecordStatusBadge } = module.exports;

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

test('record status badge renders with equal width and title when enabled', async () => {
    const defaultView = await mount(h(RecordStatusBadge, { status: 1 }));
    try {
        const badge = defaultView.host.querySelector('.hydro-record-status-badge') as HTMLElement;
        assert.ok(badge);
        assert.equal(badge.classList.contains('hydro-record-status-badge--equal-width'), false);
        assert.equal(badge.getAttribute('title'), 'Accepted');
    } finally {
        await defaultView.close();
    }

    const equalView = await mount(h(RecordStatusBadge, { status: 6, equalWidth: true }));
    try {
        const badge = equalView.host.querySelector('.hydro-record-status-badge') as HTMLElement;
        assert.ok(badge);
        assert.equal(badge.classList.contains('hydro-record-status-badge--equal-width'), true);
        assert.equal(badge.getAttribute('title'), 'Runtime Error');
    } finally {
        await equalView.close();
    }
});

test('equal-width badge CSS defines fixed 5-glyph width, centered alignment and text truncation without shadow/pulse', () => {
    const css = postcss.parse(readFileSync(new URL('../src/styles/tailwind.css', import.meta.url), 'utf8'));
    const rules = new Map<string, Record<string, string>>();
    css.walkRules((rule) => {
        const values: Record<string, string> = {};
        rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
        for (const selector of rule.selectors) rules.set(selector, { ...rules.get(selector), ...values });
    });

    const rootRule = rules.get('.hydro-record-status-badge--equal-width');
    assert.ok(rootRule);
    assert.match(rootRule.width, /5(\.2)?em/);
    assert.equal(rootRule['justify-content'], 'center');
    assert.equal(rootRule['text-align'], 'center');
    assert.equal(rootRule['box-shadow'], undefined, 'No box-shadow allowed');
    assert.equal(Boolean(rootRule.animation?.includes('pulse')), false, 'No pulse allowed');

    const labelRule = rules.get('.hydro-record-status-badge--equal-width .mantine-Badge-label');
    assert.ok(labelRule);
    assert.equal(labelRule['text-overflow'], 'ellipsis');
    assert.equal(labelRule['white-space'], 'nowrap');
    assert.equal(labelRule['text-align'], 'center');
    assert.equal(labelRule['overflow'], 'hidden');
});

test('record status badges take their colours from the --hydro-judge tokens', async () => {
    for (const [status, tone] of [[1, 'ac'], [2, 'wa'], [3, 'tle'], [0, 'pending'], [20, 'pending'], [9, 'neutral'], [999, 'neutral']] as const) {
        // Mount one badge at a time: each view owns the shared document body.
        // eslint-disable-next-line no-await-in-loop
        const view = await mount(h(RecordStatusBadge, { status }));
        try {
            const badge = view.host.querySelector('.hydro-record-status-badge') as HTMLElement;
            assert.equal(badge.style.getPropertyValue('--badge-bg'), `var(--hydro-judge-${tone}-soft)`, `status ${status}`);
            assert.equal(badge.style.getPropertyValue('--badge-color'), `var(--hydro-judge-${tone}-text)`, `status ${status}`);
        } finally {
            // eslint-disable-next-line no-await-in-loop
            await view.close();
        }
    }
});
