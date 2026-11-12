import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { resolveUiAddonMock } from '../../../test/ui-addon-mocks.ts';
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
    const clockModule = { exports: {} as any };
    runInNewContext(transformSync(readFileSync(new URL('../../ui-next/src/components/common/rolling-clock.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code, { module: clockModule, exports: clockModule.exports, require, document: dom.window.document });
    const mocks: Record<string, any> = {
        '../../../replay': replay, '../../../timeline': timeline,
        '@/components/common/button': { Button, ActionIcon, ButtonBase: (props: any) => h('button', props) },
        '@/components/common/select': { ShortSelect: () => null },
        '@/components/common/rolling-clock': clockModule.exports,
        '@/components/editor/code-editor': { CodeEditor: ({ value }: any) => h('pre', { 'data-testid': 'code' }, value) },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string, value: number) => key.replace('{0}', String(value)) }) },
        './code-replay.css': {},
    };
    const code = transformSync(readFileSync(new URL('../ui/components/record/code-replay.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, performance,
        require: (name: string) => resolveUiAddonMock(name, mocks, require),
    });
    const root = createRoot(dom.window.document.getElementById('root'));
    try {
        const events = [
            { seq: 1, t: 1000, action: 'template', timestamp: 1_000_001_000, changes: [] },
            { seq: 2, t: 4000, changes: [{ rangeOffset: 0, rangeLength: 0, text: 'abc' }] },
            { seq: 3, t: 7000, action: 'paste', timestamp: 1_000_007_000, characters: 3, changes: [] },
            { seq: 4, t: 12_000, action: 'self_test', timestamp: 1_000_012_000, changes: [] },
            { seq: 5, t: 15_000, changes: [{ rangeOffset: 0, rangeLength: 3, text: 'done' }] },
            { seq: 6, t: 20_000, action: 'submit', timestamp: 1_000_020_000, changes: [] },
        ];
        await act(async () => root.render(h(MantineProvider, {}, h(module.exports.CodeReplay, { events, initialCode: '', finalCode: 'done' }))));
        const actions = [...dom.window.document.querySelectorAll<HTMLButtonElement>('.hydro-code-replay__action')];
        assert.equal(actions.length, 4);
        assert.ok(actions[1].textContent?.includes('00:07'));
        const clock = dom.window.document.querySelector<HTMLElement>('.hydro-code-replay__clock .hydro-clock')!;
        assert.equal(clock.getAttribute('aria-label'), '00:00');
        assert.equal(clock.style.minInlineSize, '5ch');
        assert.ok(actions[1].textContent?.includes('3 characters'));
        assert.equal(actions[1].querySelector('time')?.dateTime, new Date(1_000_007_000).toISOString());
        await act(async () => actions[2].click());
        assert.equal(clock.getAttribute('aria-label'), '00:12');
        assert.equal(clock.style.minInlineSize, '5ch');
        assert.equal(dom.window.document.querySelector('[data-testid="code"]')?.textContent, 'abc');
        await act(async () => actions[3].click());
        assert.equal(dom.window.document.querySelector('[data-testid="code"]')?.textContent, 'done');
        assert.equal(dom.window.document.querySelectorAll('.hydro-code-replay__marker').length, 4);

        // Within 2s of an action node it locks onto it; beyond 2s between operations it does not mark.
        const current = () => actions.findIndex((action) => action.getAttribute('aria-current') === 'step');
        await act(async () => actions[2].click());
        assert.equal(current(), 2);
        const previousStep = dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Previous Step"]')!;
        await act(async () => previousStep.click());
        assert.equal(current(), 1);
        await act(async () => previousStep.click());
        assert.equal(current(), -1, 'between operations outside 2s window, no action is marked as current');
        assert.equal(actions[0].dataset.state, 'past');
        assert.equal(actions[1].dataset.state, 'future');
        assert.equal(actions[3].dataset.state, 'future');
        const markersBetween = [...dom.window.document.querySelectorAll<HTMLElement>('.hydro-code-replay__marker')];
        assert.deepEqual(markersBetween.map((marker) => marker.hasAttribute('data-active')), [false, false, false, false]);
        await act(async () => previousStep.click());
        assert.equal(current(), 0, 'on the template action node (within 2s), it marks current');
        assert.equal(actions[0].dataset.state, 'current');
        const markersOnNode = [...dom.window.document.querySelectorAll<HTMLElement>('.hydro-code-replay__marker')];
        assert.deepEqual(markersOnNode.map((marker) => marker.hasAttribute('data-active')), [true, false, false, false]);

        // When the event node is outside the visible box, it automatically scrolls the list to lock onto it.
        const list = dom.window.document.querySelector<HTMLElement>('.hydro-code-replay__actions')!;
        Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true });
        list.scrollTop = 0;
        const lastActionItem = list.children[3] as HTMLElement;
        Object.defineProperty(lastActionItem, 'offsetTop', { value: 300, configurable: true });
        Object.defineProperty(lastActionItem, 'offsetHeight', { value: 28, configurable: true });
        await act(async () => actions[3].click());
        assert.equal(current(), 3);
        assert.equal(list.scrollTop, 300 - (100 - 28) / 2);
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as any)[key];
        }
    }
});
