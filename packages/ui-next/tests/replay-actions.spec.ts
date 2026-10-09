import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import * as replay from '../../code-replay/replay.ts';
import * as timeline from '../../code-replay/timeline.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MantineProvider, Button, ActionIcon } = require('@mantine/core');

test('replay actions show relative/actual times, paste length, and seek to the code at that operation', async () => {
    const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://oj.example', pretendToBeVisual: true });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot,
        Document: dom.window.Document, HTMLInputElement: dom.window.HTMLInputElement,
        requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
        ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    }
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const module = { exports: {} as any };
    const mocks: Record<string, any> = {
        '@hydrooj/code-replay/replay': replay, '@hydrooj/code-replay/timeline': timeline,
        '@/components/common/button': { Button, ActionIcon, ButtonBase: (props: any) => h('button', props) },
        '@/components/common/select': { ShortSelect: () => null },
        '@/components/editor/code-editor': { CodeEditor: ({ value }: any) => h('pre', { 'data-testid': 'code' }, value) },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string, value: number) => key.replace('{0}', String(value)) }) },
        './code-replay.css': {},
    };
    const code = transformSync(readFileSync(new URL('../src/components/record/code-replay.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, performance,
        require: (name: string) => mocks[name] ?? require(name),
    });
    const root = createRoot(dom.window.document.getElementById('root'));
    try {
        const events = [
            { seq: 1, t: 1000, action: 'template', timestamp: 1_000_001_000, changes: [] },
            { seq: 2, t: 1000, changes: [{ rangeOffset: 0, rangeLength: 0, text: 'abc' }] },
            { seq: 3, t: 5000, action: 'paste', timestamp: 1_000_005_000, characters: 3, changes: [] },
            { seq: 4, t: 9000, action: 'self_test', timestamp: 1_000_009_000, changes: [] },
            { seq: 5, t: 10_000, changes: [{ rangeOffset: 0, rangeLength: 3, text: 'done' }] },
            { seq: 6, t: 12_000, action: 'submit', timestamp: 1_000_012_000, changes: [] },
        ];
        await act(async () => root.render(h(MantineProvider, {}, h(module.exports.CodeReplay, { events, initialCode: '', finalCode: 'done' }))));
        const actions = [...dom.window.document.querySelectorAll<HTMLButtonElement>('.hydro-code-replay__action')];
        assert.equal(actions.length, 4);
        assert.ok(actions[1].textContent?.includes('0:05'));
        assert.ok(actions[1].textContent?.includes('3 characters'));
        assert.equal(actions[1].querySelector('time')?.dateTime, new Date(1_000_005_000).toISOString());
        await act(async () => actions[2].click());
        assert.equal(dom.window.document.querySelector('[data-testid="code"]')?.textContent, 'abc');
        await act(async () => actions[3].click());
        assert.equal(dom.window.document.querySelector('[data-testid="code"]')?.textContent, 'done');
        assert.equal(dom.window.document.querySelectorAll('.hydro-code-replay__marker').length, 4);
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as any)[key];
        }
    }
});
