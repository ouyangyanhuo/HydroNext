import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import * as updates from '../src/utils/client-update.ts';
import * as proctor from '../src/utils/proctor.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/exam/manage/client-updates' });
const previous = new Map<string, PropertyDescriptor | undefined>();
let request: (url: string, init?: any) => Promise<any>;
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: (url: string, init: any) => request(url, init) })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const { act, createElement: h } = require('react');
const { createRoot } = require('react-dom/client');
const box = ({ children }: any) => h('div', null, children);
const Grid: any = box;
Grid.Col = box;
const Table: any = ({ children }: any) => h('table', null, children);
for (const [key, tag] of Object.entries({ Thead: 'thead', Tbody: 'tbody', Tr: 'tr', Td: 'td', Th: 'th' })) {
    Table[key] = ({ children }: any) => h(tag, null, children);
}
Table.ScrollContainer = box;
const field = ({ label, value, onChange, readOnly, placeholder }: any) => h('label', null, label,
    h('input', { 'data-field': label || placeholder, value, onChange, readOnly }));
let args: any;
let allowed = true;
const notices: any[] = [];
const mocks: any = {
    '@mantine/core': { Alert: box, Badge: box, Card: box, Grid, Group: box, Stack: box, Table, Text: box, Title: box, TextInput: field,
        Textarea: ({ label, value, onChange, readOnly, 'aria-label': ariaLabel }: any) => h('textarea', { 'data-field': label || ariaLabel, value, onChange, readOnly }),
        FileInput: ({ onChange, value }: any) => h('label', null, h('span', null, value?.name), h('input', { type: 'file', onChange: (e: any) => onChange(e.target.files[0]) })),
        Pagination: ({ value, total, onChange, disabled }: any) => h('button', { disabled: disabled || value >= total, onClick: () => onChange(value + 1) }, 'Next page') },
    '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
    '@tabler/icons-react': { IconDownload: box, IconUpload: box },
    '@/components/common/button': { Button: ({ onClick, children, disabled, loading, type = 'button' }: any) => h('button', { onClick, disabled: disabled || loading, type }, children) },
    '@/components/common/confirm-dialog': { ConfirmDialog: ({ opened, onConfirm }: any) => opened ? h('button', { onClick: onConfirm }, 'Confirm') : null },
    '@/components/common/page-header': { PageHeader: ({ title, children }: any) => h('header', null, title, children) },
    '@/components/common/select': { LongSelect: ({ label, data, value, onChange }: any) => h('select', {
        'data-field': label, value: value || '', onChange: (event: any) => onChange(event.target.value),
    }, h('option', { value: '' }, 'None'), ...data.map((item: any) => h('option', { value: item.value, key: item.value }, item.label))) },
    '@/context/page-data': { usePageData: () => ({ args }) },
    '@/hooks/use-build-url': { useBuildUrl: () => (_: any, __: any, query: any = {}) => `/d/exam/manage/client-updates?${new URLSearchParams(query)}` },
    '@/hooks/use-i18n': { useI18n: () => ({ t: (value: string) => value === 'Package version must match the release version.' ? '版本不匹配' : value }) },
    '@/hooks/use-permission': { PRIV: { PRIV_EDIT_SYSTEM: 1 }, useHasPriv: () => allowed },
    '@/utils/client-update': updates, '@/utils/proctor': proctor,
};
const module = { exports: {} as any };
const code = transformSync(readFileSync(new URL('../src/pages/manage_client_updates.tsx', import.meta.url), 'utf8'),
    { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
runInNewContext(code, { module, exports: module.exports, URL, window: dom.window, FormData: dom.window.FormData,
    fetch: (url: string, init: any) => request(url, init), require: (name: string) => mocks[name] ?? require(name) });
const Page = module.exports.default;
const asset = { id: 'a'.repeat(24), kind: 'config', version: '1.0.0', filename: 'exam-config.json', size: 100, sha256: 'a'.repeat(64) };
function pageData(page = 1) {
    return { page, pageCount: 2, count: 30, assets: [asset], selectedAssets: [], q: '', publishedAssets: [], revision: 0, manifest: null,
        draft: { origin: 'https://oj.example', version: '1.0.0', minClientVersion: '1.0.0', description: '', changelog: [],
            asar: '', config: asset.id, installer: '', portable: '', asarFallbackUrl: '', configFallbackUrl: '' } };
}
async function mount(overrides: any = {}) {
    args = { ...pageData(), ...overrides };
    notices.length = 0;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(Page)));
    return { host, close: async () => {
        await act(async () => root.unmount());
        host.remove();
    } };
}
function button(host: Element, text: string) {
    const result = Array.from(host.querySelectorAll('button')).find((node) => node.textContent === text);
    assert.ok(result, `Missing ${text}`);
    return result;
}
async function enter(input: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
}
test('non-admins do not see update management controls', async () => {
    allowed = false;
    const view = await mount();
    try { assert.equal(view.host.textContent, 'Access Denied'); } finally {
        await view.close();
        allowed = true;
    }
});

test('paging and search preserve unsaved release settings and selected package options', async () => {
    const urls: string[] = [];
    request = async (url) => {
        urls.push(url);
        return { ok: true, json: async () => ({ ...pageData(2), assets: [], q: '1.0' }) };
    };
    const view = await mount();
    try {
        await enter(view.host.querySelector('[data-field="Release description"]')!, 'Unsaved description');
        await act(async () => button(view.host, 'Next page').click());
        assert.ok(urls[0].includes('page=2'));
        assert.equal((view.host.querySelector('[data-field="Release description"]') as HTMLInputElement).value, 'Unsaved description');
        assert.equal((view.host.querySelector('[data-field="Remote client configuration"]') as HTMLSelectElement).value, asset.id);
        await enter(view.host.querySelector('[data-field="Search package filename or version"]')!, '1.0');
        await act(async () => view.host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
        assert.ok(urls[1].includes('q=1.0'));
        assert.ok(view.host.querySelector('[data-field="Update manifest JSON"]'));
    } finally { await view.close(); }
});

test('publishing requires confirmation and displays localized validation failure as a notification', async () => {
    const calls: any[] = [];
    request = async (_, init) => {
        calls.push(JSON.parse(init.body));
        return { ok: false, json: async () => ({ error: { name: 'ValidationError', params: ['draft', null, 'Package version must match the release version.'] } }) };
    };
    const view = await mount();
    try {
        await act(async () => button(view.host, 'Publish update').click());
        assert.equal(calls.length, 0);
        await act(async () => button(view.host, 'Confirm').click());
        assert.equal(calls[0].operation, 'publish');
        assert.equal(calls[0].revision, 0);
        assert.equal(notices[0].message, '版本不匹配');
    } finally { await view.close(); }
});

test('drag/drop upload authorizes before sending files and selects the uploaded draft without publishing', async () => {
    const operations: string[] = [];
    request = async (_, init) => {
        if (!init) return { ok: true, json: async () => pageData() };
        const body = init.body;
        const operation = typeof body === 'string' ? JSON.parse(body).operation : body.get('operation');
        operations.push(operation);
        return { ok: true, json: async () => operation === 'upload' ? { asset } : { ok: true } };
    };
    const view = await mount();
    try {
        await act(async () => {
            const select = view.host.querySelector('[data-field="Package type"]') as HTMLSelectElement;
            select.value = 'config';
            select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', { value: { files: [new dom.window.File(['{}'], 'exam-config.json')] } });
        await act(async () => view.host.querySelector('input[type="file"]')!.parentElement!.parentElement!.dispatchEvent(drop));
        await act(async () => button(view.host, 'Upload').click());
        assert.deepEqual(operations, ['authorize', 'upload']);
        assert.equal((view.host.querySelector('[data-field="Remote client configuration"]') as HTMLSelectElement).value, asset.id);
        assert.ok(notices[0].message.includes('draft'));
    } finally { await view.close(); }
});

test('delete requires confirmation, clears only deleted selections and returns from an empty last page', async () => {
    const operations: any[] = [];
    request = async (_, init) => {
        if (init?.method === 'POST') {
            operations.push(JSON.parse(init.body));
            return { ok: true, json: async () => ({ ok: true, deletedId: asset.id, revision: 1, publishedAssets: [] }) };
        }
        return { ok: true, json: async () => ({ ...pageData(1), assets: [], count: 0, pageCount: 1 }) };
    };
    const view = await mount({ page: 2 });
    try {
        await enter(view.host.querySelector('[data-field="Release description"]')!, 'Keep unsaved description');
        await act(async () => button(view.host, 'Delete').click());
        assert.equal(operations.length, 0);
        await act(async () => button(view.host, 'Confirm').click());
        assert.equal(operations[0].operation, 'delete');
        assert.equal(operations[0].id, asset.id);
        assert.equal(operations[0].revision, 0);
        assert.equal((view.host.querySelector('[data-field="Remote client configuration"]') as HTMLSelectElement).value, '');
        assert.equal((view.host.querySelector('[data-field="Release description"]') as HTMLInputElement).value, 'Keep unsaved description');
        assert.ok(!view.host.querySelector(`option[value="${asset.id}"]`));
        assert.ok(button(view.host, 'Next page').disabled);
        assert.equal(notices[0].title, 'Package deleted');
    } finally { await view.close(); }
});

test('packages referenced by the current published release have a disabled delete button', async () => {
    const view = await mount({ activeAssets: [asset.id] });
    try {
        assert.ok(button(view.host, 'Delete').disabled);
    } finally { await view.close(); }
});
