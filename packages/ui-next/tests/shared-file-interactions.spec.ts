import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { formatErrorMessage } from '../src/utils/error.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/team/', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
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
const { act, createElement: h } = require('react');
const { createRoot } = require('react-dom/client');
const { MantineProvider } = require('@mantine/core');
let fetchFile = async (_url: string, _options: any): Promise<any> => ({ ok: true, text: async () => 'original' });
const translate = (key: string) => key;
const useI18n = () => ({ t: translate });
function component(path: string, mocks: Record<string, any> = {}) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const code = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic', logLevel: 'silent' }).code;
    const module = { exports: {} as any };
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, AbortController, DOMException, URL,
        FormData: dom.window.FormData,
        fetch: (url: string, options: any) => fetchFile(url, options),
        require: (id: string) => mocks[id] ?? ({
            '@/hooks/use-i18n': { useI18n },
            './use-i18n': { useI18n },
            '@/utils/error': { formatErrorMessage },
            '@/components/common/button': {
                Button: ({ children, loading, disabled, onClick }: any) => h('button', {
                    type: 'button', disabled: loading || disabled, onClick,
                }, children),
            },
        } as Record<string, any>)[id] ?? require(id),
    });
    return module.exports;
}

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
const { FilePreviewModal } = component('../src/components/common/file-preview-modal.tsx', {
    '@/components/editor/code-editor': {
        CodeEditor: ({ value, readOnly, onChange }: any) => h('textarea', {
            value, readOnly, onInput: (event: any) => onChange(event.currentTarget.value),
        }),
    },
    '@/components/common/confirm-dialog': {
        ConfirmDialog: ({ opened, onConfirm, onClose, message }: any) => opened ? h('div', { 'data-confirm': true },
            message, h('button', { onClick: onConfirm }, 'Discard'), h('button', { onClick: onClose }, 'Keep editing')) : null,
    },
});
const fileProps = { opened: true, file: { name: 'main.cpp', size: 8 }, fileUrl: '/d/team/p/1/file/main.cpp' };

test('file preview is truly read-only without edit permission', async () => {
    const view = await mount(h(FilePreviewModal, { ...fileProps, onClose() {}, onSave: async () => assert.fail('must not save') }));
    try {
        assert.equal(document.querySelector('textarea')?.readOnly, true);
        assert.equal(document.querySelector('textarea')?.value, 'original');
        assert.ok(!Array.from(document.querySelectorAll('button')).some((button) => button.textContent === 'Save'));
    } finally { await view.close(); }
});

test('failed text loading shows an error and cannot overwrite the file with an empty editor', async () => {
    fetchFile = async () => { throw new Error('Connection lost'); };
    const view = await mount(h(FilePreviewModal, { ...fileProps, canEdit: true, onClose() {}, onSave: async () => {} }));
    try {
        assert.match(document.querySelector('[role="alert"]')!.textContent!, /Connection lost/);
        assert.equal(document.querySelector('textarea'), null);
    } finally {
        await view.close();
        fetchFile = async () => ({ ok: true, text: async () => 'original' });
    }
});

test('save failure keeps the draft, blocks repeated requests, and asks before discarding changes', async () => {
    let reject!: (error: Error) => void;
    let saves = 0;
    let closed = 0;
    const view = await mount(h(FilePreviewModal, {
        ...fileProps, canEdit: true, onClose: () => closed++,
        onSave: () => {
            saves++;
            return new Promise((_, fail) => { reject = fail; });
        },
    }));
    try {
        const textarea = document.querySelector('textarea')!;
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!;
            setter.call(textarea, 'changed');
            textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save')!;
        await act(async () => {
            save.click();
            save.click();
        });
        assert.equal(saves, 1);
        assert.equal(textarea.readOnly, true);
        await act(async () => reject(new Error('Save rejected')));
        assert.equal(closed, 0);
        assert.equal(textarea.value, 'changed');
        assert.match(document.querySelector('[role="alert"]')!.textContent!, /Save rejected/);
        await act(async () => (document.querySelector('.mantine-Modal-close') as HTMLElement).click());
        assert.equal(closed, 0);
        assert.ok(document.querySelector('[data-confirm]'));
        const discard = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Discard')!;
        await act(async () => discard.click());
        assert.equal(closed, 1);
    } finally { await view.close(); }
});

const { DataTable } = component('../src/components/common/data-table.tsx', {
    './empty-state': { EmptyState: ({ message }: any) => h('div', null, message) },
});

test('row keyboard navigation does not steal key events from buttons and links inside cells', async () => {
    let activated = 0;
    const view = await mount(h(DataTable, {
        data: [{ _id: 1 }], onRowClick: () => activated++,
        columns: [{ key: 'actions', title: 'Actions', render: () => h('button', null, 'Open') }],
    }));
    try {
        const button = view.host.querySelector('button')!;
        const key = new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        await act(async () => button.dispatchEvent(key));
        assert.equal(key.defaultPrevented, false);
        assert.equal(activated, 0);
        const row = view.host.querySelector('tbody tr')!;
        const rowKey = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        await act(async () => row.dispatchEvent(rowKey));
        assert.equal(rowKey.defaultPrevented, true);
        assert.equal(activated, 1);
    } finally { await view.close(); }
});

let uploads = 0;
let aborted = 0;
let finish!: () => void;
const { useFileUpload } = component('../src/hooks/use-file-upload.ts', {
    '@/utils/file-upload': {
        validateUploadFiles: () => undefined,
        uploadForm: (_action: string, _body: any, signal: AbortSignal) => {
            uploads++;
            return new Promise((resolve, reject) => {
                finish = () => resolve({ ok: true });
                signal.addEventListener('abort', () => {
                    aborted++;
                    reject(new DOMException('Aborted', 'AbortError'));
                });
            });
        },
    },
});
const { FileDropzone } = component('../src/components/common/file-dropzone.tsx', {
    '@/hooks/use-file-upload': { useFileUpload },
});

test('dropzone is keyboard accessible, rejects overlapping uploads and aborts on unmount', async () => {
    let completed = 0;
    const view = await mount(h(FileDropzone, { action: '/d/team/upload', onComplete: () => completed++ }));
    const zone = view.host.querySelector('[role="button"]')!;
    const input = view.host.querySelector('input')!;
    let chooser = 0;
    input.click = () => { chooser++; };
    await act(async () => zone.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.equal(chooser, 1);
    const drop = () => {
        const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { files: [new dom.window.File(['test'], '1.in')] } });
        zone.dispatchEvent(event);
    };
    await act(async () => {
        drop();
        drop();
    });
    assert.equal(uploads, 1);
    assert.equal(zone.getAttribute('aria-disabled'), 'true');
    await act(async () => zone.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.equal(chooser, 1);
    await act(async () => finish());
    assert.equal(completed, 1);
    await act(async () => drop());
    assert.equal(uploads, 2);
    await view.close();
    assert.equal(aborted, 1);
    assert.equal(completed, 1);
});

const navigated: string[] = [];
const { Link } = component('../src/components/link.tsx', {
    '../context/router': { useNavigate: () => (href: string) => navigated.push(href) },
    '../hooks/use-build-url': { useBuildUrl: () => () => '/d/team/p/1' },
});

test('links preserve downloads and native external navigation while internal routes use the router', async () => {
    const view = await mount(h('div', null,
        h(Link, { href: '/archive.zip', download: '' }, 'Download'),
        h(Link, { href: 'https://other.example' }, 'External'),
        h(Link, { href: 'mailto:admin@example.org' }, 'Mail'),
        h(Link, { href: '/d/team/record' }, 'Records')));
    // Cancel the browser default only after React has decided whether to intercept the link.
    const preventNavigation = (event: Event) => event.preventDefault();
    window.addEventListener('click', preventNavigation);
    try {
        const links = view.host.querySelectorAll('a');
        await act(async () => {
            links[0].click();
            links[1].click();
            links[2].click();
        });
        assert.deepEqual(navigated, []);
        await act(async () => links[3].click());
        assert.deepEqual(navigated, ['/d/team/record']);
    } finally {
        window.removeEventListener('click', preventNavigation);
        await view.close();
    }
});

const buildDomainUrl = () => '/domain/search';
const { FormDialog } = component('../src/components/common/form-dialog.tsx', {
    '@/components/common/select': { LongSelect: () => null },
    '@/hooks/use-build-url': { useBuildUrl: () => buildDomainUrl },
});

test('domain search failures are reported instead of being presented as an empty search', async () => {
    fetchFile = async () => ({ ok: false });
    const view = await mount(h(FormDialog, {
        opened: true, title: 'Choose domain', onClose() {}, onSubmit() {},
        fields: [{ name: 'domain', type: 'domain', label: 'Domain' }],
    }));
    try {
        const input = document.querySelector('input')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'team');
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
        assert.match(document.querySelector('[role="alert"]')!.textContent!, /Operation failed/);
        assert.ok(!document.body.textContent?.includes('No domains found'));
    } finally {
        await view.close();
        fetchFile = async () => ({ ok: true, text: async () => 'original' });
    }
});
