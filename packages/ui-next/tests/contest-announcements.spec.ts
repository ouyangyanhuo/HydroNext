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

const finishMocks = {
    '@/components/common/button': { Button },
    '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    '@/utils/error': { formatErrorMessage: (error: any) => error.message },
    '@/utils/proctor': load('../src/utils/proctor.ts', {}),
};
const finishButton = load('../src/components/contest/proctor-finish-button.tsx', finishMocks);

test('global announcement modal displays escaped content, confirms one at a time and waits for server acknowledgement', async () => {
    let callbacks: any;
    const sent: any[] = [];
    const { ContestAnnouncements } = load('../src/components/contest/contest-announcements.tsx', {
        './proctor-finish-button': finishButton,
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/hooks/use-websocket': { useWebSocket: (options: any) => { callbacks = options; return { send: (data: any) => sent.push(data) }; } },
        '@/context/page-data': { usePageData: () => ({ args: {}, name: 'homepage', url: '/' }) },
        '@/context/router': { useNavigate: () => async () => {} },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/' },
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

test('ending notices refresh only their contest and return to its domain overview after server acknowledgement', async () => {
    let callbacks: any;
    const navigations: string[] = [];
    const sent: any[] = [];
    const tid = '1234567890abcdef12345678';
    const navigate = async (url: string) => { navigations.push(url); };
    const earlyMessage = 'Your team has ended the proctored contest early. Contest submissions are now closed.';
    const dictionary = require('js-yaml').load(readFileSync(new URL('../locales/zh.yaml', import.meta.url), 'utf8'));
    const { ContestAnnouncements } = load('../src/components/contest/contest-announcements.tsx', {
        './proctor-finish-button': finishButton,
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key === earlyMessage ? dictionary[key] : key }) },
        '@/hooks/use-websocket': { useWebSocket: (options: any) => { callbacks = options; return { send: (data: any) => sent.push(data) }; } },
        '@/context/page-data': { usePageData: () => ({ args: { tdoc: { docId: tid }, UiContext: { domainId: 'exam' } },
            name: 'problem_detail', url: '/d/exam/p/1' }) },
        '@/context/router': { useNavigate: () => navigate },
        '@/hooks/use-build-url': { useBuildUrl: () => (_: string, args: any) => `/d/${args.domainId}/contest/${args.tid}` },
        '@/components/common/button': { Button }, '@/utils/error': { formatErrorMessage: () => 'Failed' },
    });
    const container = dom.window.document.createElement('div');
    dom.window.document.body.append(container);
    const root = createRoot(container);
    const notice = { _id: 'abcdef1234567890abcdef12', tid, domainId: 'other', title: 'Exam', content: earlyMessage,
        createdAt: new Date().toISOString(), kind: 'team-ended', proctorEnabled: true };
    try {
        await act(async () => root.render(h(MantineProvider, null, h(ContestAnnouncements))));
        await act(async () => {
            callbacks.onOpen();
            callbacks.onMessage({ announcements: [notice] });
        });
        assert.equal(navigations.length, 0);
        await act(async () => callbacks.onMessage({ announcements: [{ ...notice, domainId: 'exam' }] }));
        assert.deepEqual(navigations, [dom.window.location.href]);
        await act(async () => callbacks.onMessage({ announcements: [{ ...notice, domainId: 'exam' }] }));
        assert.equal(navigations.length, 1);
        assert.ok(dom.window.document.body.textContent?.includes('End proctoring and upload your log'));
        assert.ok(dom.window.document.body.textContent?.includes('您的队伍已提前结束本次监考考试'));
        assert.ok(!dom.window.document.body.textContent?.includes('您的参赛时间已到'));
        const button = Array.from(dom.window.document.querySelectorAll('button'))
            .find((item: any) => item.textContent === 'I understand') as HTMLButtonElement;
        await act(async () => button.click());
        assert.equal(sent[0].id, notice._id);
        assert.equal(navigations.length, 1);
        await act(async () => callbacks.onMessage({ announcements: [] }));
        assert.equal(navigations[1], `/d/exam/contest/${tid}`);
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

test('自然结束或提前结束的通知在断线时仍可打开客户端上传流程，取消不会确认已上传', async () => {
    let callbacks: any;
    let requested = 0;
    let settle: (() => void) | undefined;
    (dom.window as any).examAPI = { requestQuit: () => {
        requested++;
        return new Promise<void>((resolve) => { settle = resolve; });
    } };
    const navigate = async () => {};
    const { ContestAnnouncements } = load('../src/components/contest/contest-announcements.tsx', {
        './proctor-finish-button': finishButton,
        '@/hooks/use-i18n': finishMocks['@/hooks/use-i18n'],
        '@/hooks/use-websocket': { useWebSocket: (options: any) => { callbacks = options; return { send() {} }; } },
        '@/context/page-data': { usePageData: () => ({ args: {}, name: 'error', url: '/d/exam/p/1' }) },
        '@/context/router': { useNavigate: () => navigate },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/' },
        '@/components/common/button': { Button }, '@/utils/error': finishMocks['@/utils/error'],
    });
    const container = dom.window.document.createElement('div');
    dom.window.document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(h(MantineProvider, null, h(ContestAnnouncements))));
        for (const kind of ['contest-ended', 'team-ended', 'participation-ended']) {
            const receive = callbacks.onMessage;
            // eslint-disable-next-line no-await-in-loop
            await act(async () => receive({ announcements: [{
                _id: '1234567890abcdef12345678', tid: '1234567890abcdef12345678', domainId: 'exam',
                title: 'Exam', content: 'Closed', createdAt: new Date().toISOString(), kind, proctorEnabled: true,
            }] }));
            const button = Array.from(dom.window.document.querySelectorAll('button'))
                .find((item: any) => item.textContent === 'End personal proctoring and upload log') as HTMLButtonElement;
            assert.ok(button);
            assert.equal(button.disabled, false, '结束入口不依赖通知连接或提交权限');
            const before = requested;
            // eslint-disable-next-line no-await-in-loop
            await act(async () => {
                button.click();
                button.click();
            });
            assert.equal(requested, before + 1);
            const complete = settle;
            // eslint-disable-next-line no-await-in-loop
            await act(async () => complete?.());
            assert.equal(button.disabled, false);
            assert.equal(dom.window.document.body.textContent?.includes('Final log uploaded'), false);
        }
    } finally {
        await act(async () => root.unmount());
        container.remove();
        delete (dom.window as any).examAPI;
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
