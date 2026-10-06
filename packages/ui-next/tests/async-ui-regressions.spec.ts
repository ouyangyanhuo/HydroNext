import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { formatErrorMessage } from '../src/utils/error.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/team/contest/123/balloon', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as any)[key];
    }
});

const { act, createElement: h, StrictMode } = require('react');
const { createRoot } = require('react-dom/client');
const { MantineProvider } = require('@mantine/core');
let args: any = {};
let request: (url: string, init: any) => Promise<any> = async () => ({ ok: true, json: async () => ({}) });
const navigated: string[] = [];
const notices: any[] = [];
const navigate = async (url: string) => { navigated.push(url); };
const translate = (key: string, values: any = {}) => Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), key,
);
const mocks: Record<string, any> = {
    '@/hooks/use-i18n': { useI18n: () => ({ t: translate }) },
    './use-i18n': { useI18n: () => ({ t: translate }) },
    '@/hooks/use-build-url': { useBuildUrl: () => () => '/domain/search' },
    '@/context/page-data': { usePageData: () => ({ args }) },
    '@/context/router': { useNavigate: () => navigate },
    '@/utils/error': { formatErrorMessage },
    '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
    '@/components/common/button': {
        Button: ({ children, loading, disabled, onClick, type = 'button' }: any) => h(
            'button', { type, disabled: loading || disabled, onClick }, children,
        ),
    },
    '@/components/common/select': {
        LongSelect: ({ disabled, value, onChange }: any) => h('select', {
            disabled, value, onChange: (event: any) => onChange(event.target.value),
        }, h('option', { value: '0' }, 'General')),
    },
    '@/components/common/page-header': { PageHeader: ({ children, title }: any) => h('header', null, title, children) },
    '@/components/common/time-display': { TimeDisplay: () => null },
    '@/components/common/confirm-dialog': { ConfirmDialog: () => null },
    '@/components/link': { Link: ({ children }: any) => h('span', null, children) },
    '@/components/user/user-avatar': { UserAvatar: () => null },
    '@/components/markdown/markdown-renderer': { MarkdownRenderer: ({ content }: any) => h('div', null, content) },
};

function component(path: string, overrides: Record<string, any> = {}, globals: Record<string, any> = {}) {
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
    }).code;
    const module = { exports: {} as any };
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, AbortController, URL,
        FormData: dom.window.FormData,
        fetch: (url: string, init: any) => request(url, init),
        require: (id: string) => overrides[id] ?? mocks[id] ?? require(id),
        ...globals,
    });
    return module.exports;
}

async function mount(element: any) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = async (next: any) => { await act(async () => root.render(h(MantineProvider, null, next))); };
    await render(element);
    return {
        host,
        render,
        async close() {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}
function button(text: string, scope: ParentNode = document) {
    const result = Array.from(scope.querySelectorAll('button')).find((element) => element.textContent === text);
    assert.ok(result, `Missing button: ${text}`);
    return result;
}
async function enter(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
        const prototype = input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
}
function deferred<T = any>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}
const failure = { ok: false, json: async () => ({ error: { message: 'Denied' } }) };
mocks['@/components/common/form-dialog'] = component('../src/components/common/form-dialog.tsx');
const ContestUser = component('../src/pages/contest_user.tsx').default;
const ContestBalloon = component('../src/pages/contest_balloon.tsx').default;
const ContestClarification = component('../src/pages/contest_clarification.tsx').default;

test('attendee failures retain the dialog and draft; pending submissions are locked and retry succeeds', async () => {
    args = { tdoc: { title: 'Contest' } };
    const response = deferred();
    let calls = 0;
    request = async () => {
        calls++;
        return response.promise;
    };
    const view = await mount(h(ContestUser));
    try {
        await act(async () => button('Add User', view.host).click());
        const input = document.querySelector('input:not([type="checkbox"])')! as HTMLInputElement;
        await enter(input, '1001, 1002');
        const form = document.querySelector('form')!;
        await act(async () => {
            form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
            form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        });
        assert.equal(calls, 1);
        assert.ok(document.querySelector('fieldset')?.disabled);
        assert.equal(button('Cancel').disabled, true);
        await act(async () => response.resolve(failure));
        assert.equal(input.value, '1001, 1002');
        assert.ok(document.querySelector('[role="dialog"]'));
        assert.equal(document.querySelector('fieldset')?.disabled, false);
        assert.equal(notices.at(-1).title, 'Denied');
        request = async () => ({ ok: true, json: async () => ({}) });
        await act(async () => button('Add User', form).click());
        assert.equal(navigated.at(-1), '/d/team/contest/123/balloon');
        await act(async () => button('Add User', view.host).click());
        assert.equal((document.querySelector('input:not([type="checkbox"])') as HTMLInputElement).value, '');
    } finally { await view.close(); }
});

test('balloon polling updates locally, aborts on editing, and failed saves preserve custom colors', async () => {
    const intervals = new Map<number, () => void>();
    const originalSet = window.setInterval;
    const originalClear = window.clearInterval;
    let nextTimer = 0;
    window.setInterval = ((callback: () => void) => {
        intervals.set(++nextTimer, callback);
        return nextTimer;
    }) as any;
    window.clearInterval = ((id: number) => intervals.delete(id)) as any;
    args = {
        tdoc: { title: 'Contest', pids: [1], balloon: { 1: { name: 'Blue', color: '#0000ff' } }, beginAt: 1, endAt: Date.now() + 600000 },
        bdocs: [], pdict: {}, udict: {},
    };
    let getSignal!: AbortSignal;
    let delayed: ReturnType<typeof deferred> | null = null;
    request = async (_url, init) => {
        if (init.method === 'POST') return failure;
        getSignal = init.signal;
        if (delayed) return delayed.promise;
        return { ok: true, json: async () => ({ ...args, tdoc: { ...args.tdoc, title: 'Refreshed contest' } }) };
    };
    const navigationCount = navigated.length;
    const view = await mount(h(ContestBalloon));
    try {
        await act(async () => intervals.values().next().value!());
        assert.match(view.host.textContent!, /Refreshed contest/);
        assert.equal(navigated.length, navigationCount);
        delayed = deferred();
        await act(async () => intervals.values().next().value!());
        await act(async () => button('Set Color').click());
        assert.equal(getSignal.aborted, true);
        assert.equal(intervals.size, 0);
        await act(async () => delayed!.resolve({ ok: true, json: async () => ({ ...args, tdoc: { ...args.tdoc, title: 'Stale refresh' } }) }));
        assert.ok(!view.host.textContent!.includes('Stale refresh'));
        const inputs = document.querySelectorAll<HTMLInputElement>('[role="dialog"] input:not([type="color"])');
        await enter(inputs[0], '#123456');
        await enter(inputs[0], '#654321');
        await enter(inputs[1], 'Custom balloon');
        await act(async () => button('Save').click());
        assert.equal(inputs[0].value, '#654321');
        assert.equal(inputs[1].value, 'Custom balloon');
        assert.ok(document.querySelector('[role="dialog"]'));
        assert.equal(notices.at(-1).title, 'Denied');
        assert.equal(intervals.size, 0);
        request = async (_url, init) => ({ ok: true, json: async () => (init.method === 'POST' ? {} : args) });
        await act(async () => button('Save').click());
        assert.equal(intervals.size, 1);
        assert.equal(navigated.length, navigationCount);
        await act(async () => button('Set Color').click());
        const saved = document.querySelectorAll<HTMLInputElement>('[role="dialog"] input:not([type="color"])');
        assert.equal(saved[0].value, '#654321');
        assert.equal(saved[1].value, 'Custom balloon');
    } finally {
        await view.close();
        window.setInterval = originalSet;
        window.clearInterval = originalClear;
    }
});

test('clarification requests lock the editor and reply target; rejection preserves the draft for retry', async () => {
    args = { tdoc: { title: 'Contest' }, tcdocs: [{ _id: 'question', owner: 12, content: 'Question' }] };
    const response = deferred();
    let calls = 0;
    request = async () => {
        calls++;
        return response.promise;
    };
    const view = await mount(h(ContestClarification));
    try {
        await act(async () => button('Reply').click());
        const input = document.querySelector('textarea')!;
        await enter(input, 'Reply draft');
        await act(async () => {
            button('Submit').click();
            button('Submit').click();
        });
        assert.equal(calls, 1);
        assert.equal(input.disabled, true);
        assert.equal(button('Reply').disabled, true);
        assert.equal(button('Send Broadcast Message').disabled, true);
        assert.equal(button('Cancel').disabled, true);
        await act(async () => response.resolve(failure));
        assert.equal(input.value, 'Reply draft');
        assert.equal(input.disabled, false);
        assert.match(view.host.textContent!, /Reply #question/);
        request = async () => ({ ok: true, json: async () => ({}) });
        await act(async () => button('Submit').click());
        assert.equal(input.value, '');
    } finally { await view.close(); }
});

test('partial uploads identify committed and remaining files, refresh the list, and never report full success', async () => {
    let calls = 0;
    const { useFileUpload } = component('../src/hooks/use-file-upload.ts', {
        '@/utils/file-upload': {
            validateUploadFiles: () => undefined,
            uploadForm: async () => { if (++calls === 2) throw new Error('Network lost'); return { ok: true }; },
        },
    });
    const { FileDropzone } = component('../src/components/common/file-dropzone.tsx', {
        '@/hooks/use-file-upload': { useFileUpload },
    });
    let complete = 0;
    let partial: any;
    const view = await mount(h(FileDropzone, {
        action: '/files', onComplete: () => complete++, onPartialComplete: (result: any) => { partial = result; },
    }));
    try {
        await act(async () => {
            const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
            const files = ['first.in', 'second.in', 'third.in'].map((name) => new dom.window.File(['test'], name));
            Object.defineProperty(drop, 'dataTransfer', { value: { files } });
            view.host.querySelector('[role="button"]')!.dispatchEvent(drop);
        });
        assert.equal(calls, 2);
        assert.equal(complete, 0);
        assert.equal(JSON.stringify(partial.uploaded), '["first.in"]');
        assert.equal(JSON.stringify(partial.remaining), '["second.in","third.in"]');
        assert.match(notices.at(-1).message, /1 files uploaded.*second.in.*Network lost/);
        assert.equal(notices.at(-1).autoClose, false);
    } finally { await view.close(); }
});

test('object URLs are released for StrictMode replay, replacement, clearing, and unmount', async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const { useObjectUrl } = component('../src/hooks/use-object-url.ts', {}, {
        URL: {
            createObjectURL: () => {
                const url = `blob:${created.length}`;
                created.push(url);
                return url;
            },
            revokeObjectURL: (url: string) => revoked.push(url),
        },
    });
    const Preview = ({ blob }: any) => h('span', null, useObjectUrl(blob));
    const first = new Blob(['first']);
    const second = new Blob(['second']);
    const view = await mount(h(StrictMode, null, h(Preview, { blob: first })));
    try {
        assert.equal(created.length - revoked.length, 1);
        await view.render(h(StrictMode, null, h(Preview, { blob: second })));
        assert.equal(created.length - revoked.length, 1);
        await view.render(h(StrictMode, null, h(Preview, { blob: null })));
        assert.equal(view.host.querySelector('span')!.textContent, '');
        assert.equal(created.length, revoked.length);
        await view.render(h(StrictMode, null, h(Preview, { blob: second })));
    } finally { await view.close(); }
    assert.deepEqual([...created].sort(), [...revoked].sort());
});

test('PDF preview renders one page at a time and cancels the outgoing page when switching', async () => {
    const loadedPages: number[] = [];
    const cleaned: number[] = [];
    const cancelled: number[] = [];
    let signal!: AbortSignal;
    const { PdfViewer } = component('../src/components/common/pdf-viewer.tsx', {
        '@/utils/pdf-preview': {
            loadPdfDocument: async (_url: string, nextSignal: AbortSignal) => {
                signal = nextSignal;
                return { numPages: 100, getPage: async (page: number) => {
                    loadedPages.push(page);
                    return {
                        getViewport: ({ scale }: any) => ({ width: 600 * scale, height: 800 * scale }),
                        render: () => ({ promise: Promise.resolve(), cancel: () => cancelled.push(page) }),
                        cleanup: () => cleaned.push(page),
                    };
                } };
            },
        },
    });
    const view = await mount(h(PdfViewer, { url: '/large.pdf' }));
    try {
        assert.deepEqual(loadedPages, [1]);
        assert.equal(view.host.querySelectorAll('canvas').length, 1);
        const previousCanvas = view.host.querySelector('canvas')!;
        await act(async () => button('2').click());
        assert.deepEqual(loadedPages, [1, 2]);
        assert.equal(view.host.querySelectorAll('canvas').length, 1);
        assert.equal(previousCanvas.width, 0);
        assert.deepEqual(cleaned, [1, 2]);
        assert.deepEqual(cancelled, [1]);
    } finally { await view.close(); }
    assert.equal(signal.aborted, true);
});
