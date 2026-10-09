import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/exam/p/1', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Document: dom.window.Document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot,
    HTMLAnchorElement: dom.window.HTMLAnchorElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true,
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
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MantineProvider, Button } = require('@mantine/core');
function load(path: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, URL, ...globals,
        require: (name: string) => mocks[name] || require(name),
    });
    return module.exports;
}

test('global announcement modal displays escaped content, confirms one at a time and waits for server acknowledgement', async () => {
    let callbacks: any;
    const sent: any[] = [];
    const { ContestAnnouncements } = load('../src/components/contest/contest-announcements.tsx', {
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/hooks/use-websocket': { useWebSocket: (options: any) => { callbacks = options; return { send: (data: any) => sent.push(data) }; } },
        '@/components/common/button': { Button }, '@/utils/error': { formatErrorMessage: () => 'Failed' },
    });
    const container = dom.window.document.createElement('div');
    dom.window.document.body.append(container);
    const root = createRoot(container);
    const first = {
        _id: '1234567890abcdef12345678', tid: '1234567890abcdef12345678', domainId: 'exam',
        title: 'Contest', content: '<img src=x onerror=alert(1)>\nImportant', createdAt: '2026-10-09T00:00:00Z',
    };
    const second = { ...first, _id: 'abcdef1234567890abcdef12', content: 'Next announcement' };
    try {
        await act(async () => root.render(h(MantineProvider, null, h(ContestAnnouncements))));
        await act(async () => {
            callbacks.onOpen();
            callbacks.onMessage({ announcements: [first, second] });
        });
        assert.equal(dom.window.document.querySelectorAll('img').length, 0);
        assert.ok(dom.window.document.body.textContent?.includes('<img src=x onerror=alert(1)>'));
        const button = Array.from(dom.window.document.querySelectorAll('button'))
            .find((item: any) => item.textContent === 'I understand') as HTMLButtonElement;
        await act(async () => button.click());
        assert.equal(sent[0].operation, 'acknowledge');
        assert.equal(sent[0].id, first._id);
        assert.ok(dom.window.document.body.textContent?.includes('Important'));
        await act(async () => callbacks.onMessage({ announcements: [second] }));
        assert.ok(dom.window.document.body.textContent?.includes('Next announcement'));
        await act(async () => callbacks.onClose());
        assert.equal(button.disabled, true);
        await act(async () => {
            callbacks.onOpen();
            callbacks.onMessage({ announcements: [] });
        });
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

test('websocket heartbeat and domain changes keep the global announcement connection usable', async () => {
    const sockets: any[] = [];
    class FakeSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSED = 3;
        readyState = 0;
        onopen?: () => void;
        onmessage?: (event: { data: string }) => void;
        onclose?: () => void;
        onerror?: () => void;
        messages: string[] = [];
        url: string;
        constructor(url: string) {
            this.url = url;
            sockets.push(this);
        }

        send(data: string) { this.messages.push(data); }
        close() { this.readyState = FakeSocket.CLOSED; }
    }
    let ui = { ws_prefix: '/' };
    const { useWebSocket } = load('../src/hooks/use-websocket.ts', {
        '@/stores/session': { useSessionStore: (selector: any) => selector({ ui }) },
    }, { WebSocket: FakeSocket, setTimeout, clearTimeout });
    const messages: any[] = [];
    function Receiver() {
        useWebSocket({ url: 'contest-announcements-conn', onMessage: (data: any) => messages.push(data) });
        return null;
    }
    const container = dom.window.document.createElement('div');
    const root = createRoot(container);
    try {
        await act(async () => root.render(h(Receiver)));
        const initial = sockets[0];
        assert.equal(initial.url, 'wss://oj.example/contest-announcements-conn');
        initial.readyState = FakeSocket.OPEN;
        initial.onmessage({ data: 'ping' });
        assert.deepEqual(initial.messages, ['pong']);
        initial.onmessage({ data: JSON.stringify({ announcements: [] }) });
        assert.equal(messages.length, 1);
        ui = { ws_prefix: '/d/other/' };
        await act(async () => root.render(h(Receiver)));
        assert.equal(initial.readyState, FakeSocket.CLOSED);
        assert.equal(initial.onclose, null);
        assert.equal(sockets.length, 2);
        assert.equal(sockets[1].url, 'wss://oj.example/d/other/contest-announcements-conn');
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
