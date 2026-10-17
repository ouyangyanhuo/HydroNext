import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('ranking RP help uses a translated portal tooltip on hover and keyboard focus', async () => {
    const { JSDOM } = require('jsdom');
    const { load } = require('js-yaml');
    const { act, createElement: h, forwardRef } = require('react');
    const { createRoot } = require('react-dom/client');
    const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
        url: 'https://oj.example/d/team/ranking', pretendToBeVisual: true,
    });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
        Document: dom.window.Document, ShadowRoot: dom.window.ShadowRoot,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
        requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
        ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const mantine = require('@mantine/core');
    const zh = load(readFileSync(new URL('../locales/zh.yaml', import.meta.url), 'utf8'));
    const mocks: Record<string, any> = {
        './ranking.css': {},
        '@/components/common/button': { ActionIcon: mantine.ActionIcon, Button: mantine.Button },
        '@/components/common/paginator': { Paginator: () => null },
        '@/components/link': { Link: forwardRef(({ children, href }: any, ref: any) => h('a', { href, ref }, children)) },
        '@/components/user/user-avatar': { UserAvatar: () => null },
        '@/context/page-data': { usePageData: () => ({ args: { sort: 'solved', udocs: [] } }) },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/d/team/ranking' },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => zh[key] || key }) },
        '@/utils/user-name': { formatUserName: () => '' },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/pages/ranking.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, { module, exports: module.exports, require: (id: string) => mocks[id] ?? require(id) });
    const root = createRoot(document.getElementById('root'));
    try {
        await act(async () => root.render(h(mantine.MantineProvider, null, h(module.exports.default))));
        const info = document.querySelector<HTMLButtonElement>('button[aria-label="关于 RP"]')!;
        assert.ok(info?.closest('th'));
        await act(async () => {
            info.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
            info.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
            info.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true }));
        });
        await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
        await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
        const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
        assert.ok(tooltip, `RP explanation should open on hover: ${document.body.textContent}`);
        assert.equal(document.getElementById('root')!.contains(tooltip), false, 'portal avoids clipping inside the table');
        for (const text of ['RP 的含义与计算规则', '不等同于解题数', '自己创建的题目不计入',
            'ln(1.03)', 'rating / 4 - 375', '10 场', '每日任务', '并非每次提交后立即刷新']) {
            assert.ok(tooltip.textContent?.includes(text), text);
        }
        await act(async () => info.dispatchEvent(new dom.window.MouseEvent('mouseleave')));
        await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
        await act(async () => info.focus());
        await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
        assert.ok(document.querySelector('[role="tooltip"]'), 'keyboard users can also read the explanation');
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});
