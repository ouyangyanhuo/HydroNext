import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import * as proctor from '../src/utils/proctor.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/exam/manage/proctor' });
const previous = new Map<string, PropertyDescriptor | undefined>();
let request: (url: string, init: any) => Promise<any>;
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: (url: string, init: any) => request(url, init),
})) {
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
const fieldControl = ({ label, value, onChange, disabled, description }: any) => h('label', null, label, description,
    h('input', { value: value ?? '', onChange, disabled }));
const Table: any = ({ children }: any) => h('table', null, children);
for (const [name, tag] of Object.entries({ Thead: 'thead', Tbody: 'tbody', Tr: 'tr', Th: 'th', Td: 'td' })) {
    Table[name] = ({ children }: any) => h(tag, null, children);
}
Table.ScrollContainer = box;
let args: any;
const notices: any[] = [];
const mocks: Record<string, any> = {
    '@mantine/core': {
        Alert: box, Card: box, Code: box, Group: box, Stack: box, Text: box, Title: box, Table,
        TextInput: fieldControl,
        NumberInput: ({ label, value, onChange }: any) => fieldControl({ label, value, onChange: (event: any) => onChange(Number(event.target.value)) }),
        Textarea: ({ label, value, description }: any) => h('label', null, label, description, h('textarea', { value, readOnly: true })),
        Checkbox: ({ checked, disabled, onChange, 'aria-label': name }: any) => h('input', { type: 'checkbox', checked, disabled, onChange, 'aria-label': name }),
        Switch: ({ checked, onChange, label }: any) => h('label', null, label, h('input', { type: 'checkbox', checked, onChange })),
        Select: ({ data, value, disabled, onChange, 'aria-label': name }: any) => h('select', {
            value, disabled, 'aria-label': name, onChange: (event: any) => onChange(event.target.value),
        }, data.map((option: string) => h('option', { key: option, value: option }, option))),
        Pagination: ({ value, total, disabled, onChange }: any) => h('button', {
            disabled: disabled || value >= total, onClick: () => onChange(value + 1),
        }, 'Next page'),
        Modal: ({ opened, children, onClose }: any) => opened ? h('section', { role: 'dialog' }, children,
            h('button', { onClick: onClose }, 'Dismiss modal')) : null,
    },
    '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
    '@/components/common/button': { Button: ({ children, loading, disabled, onClick, type = 'button' }: any) => h('button', {
        type, disabled: loading || disabled, onClick,
    }, children) },
    '@/components/common/confirm-dialog': { ConfirmDialog: ({ opened, onConfirm, onClose }: any) => opened ? h('section', null,
        h('button', { onClick: onConfirm }, 'Confirm'), h('button', { onClick: onClose }, 'Cancel')) : null },
    '@/components/common/page-header': { PageHeader: ({ title, children }: any) => h('header', null, title, children) },
    '@/components/link': { Link: ({ children }: any) => h('span', null, children) },
    '@/context/page-data': { usePageData: () => ({ args }) },
    '@/hooks/use-build-url': { useBuildUrl: () => (name: string, _: any, query: any = {}) =>
        `/d/exam/manage/proctor${name === 'manage_proctor_logs' ? '/logs' : ''}?${new URLSearchParams(query)}` },
    '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    '@/hooks/use-permission': { PRIV: { PRIV_EDIT_SYSTEM: 1 }, useHasPriv: () => true },
    '@/utils/proctor': proctor,
};
function component(path: string) {
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    runInNewContext(code, { module, exports: module.exports, window: dom.window, document: dom.window.document, URL, setTimeout,
        fetch: (url: string, init: any) => request(url, init), require: (id: string) => mocks[id] ?? require(id) });
    return module.exports;
}
mocks['./manage_proctor_logs'] = component('../src/pages/manage_proctor_logs.tsx');
const Page = component('../src/pages/manage_proctor.tsx').default;
function pageData(page = 1, pageSize = 25) {
    return { page, pageSize, pageCount: 3, count: 60, q: '', logs: [{ _id: `log-${page}`, filename: `final-${page}.hplog`,
        uploadedAt: '2026-10-10T12:00:00Z', size: 1024, domainName: 'Exam', domainId: 'exam', tid: 'contest', contestTitle: 'Contest' }] };
}
async function mount() {
    args = { ...pageData(), config: { enabled: true, requiredVersion: '1.0.0', tokenTtlSeconds: 300,
        refreshEnabled: true, uploadGraceDays: 30, maxLogMiB: 64 }, keys: null };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(h(Page)));
    return { host, close: async () => {
        await act(async () => root.unmount());
        host.remove();
    } };
}
function button(host: Element, label: string) {
    const result = Array.from(host.querySelectorAll('button')).find((element) => element.textContent === label);
    assert.ok(result, `Missing button ${label}`);
    return result;
}
async function enter(input: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
}

test('key generation shows both public keys, private viewing is explicit and closing clears private content', async () => {
    const operations: string[] = [];
    request = async (_url, init) => {
        const operation = JSON.parse(init.body).operation;
        operations.push(operation);
        return { ok: true, json: async () => operation === 'generate_keys'
            ? { keys: { keyId: 'key-id', signingPublicKey: 'auth-public', encryptionPublicKey: 'log-public' } }
            : { privateKeys: { keyId: 'key-id', signingPrivateKey: 'auth-private', encryptionPrivateKey: 'log-private' } } };
    };
    const view = await mount();
    try {
        assert.ok(!view.host.textContent?.includes('Enroll a proctor client'));
        assert.ok(view.host.textContent?.includes('Proctor logs'));
        await act(async () => button(view.host, 'Generate authentication keys').click());
        await act(async () => button(view.host, 'Confirm').click());
        assert.deepEqual(Array.from(view.host.querySelectorAll('textarea')).map((field) => field.value), ['auth-public', 'log-public']);
        assert.deepEqual(operations, ['generate_keys']);
        await act(async () => button(view.host, 'View private keys').click());
        assert.ok(view.host.querySelector('textarea[value]') === null);
        assert.ok(Array.from(view.host.querySelectorAll('textarea')).some((field) => field.value === 'auth-private'));
        await act(async () => button(view.host, 'Dismiss modal').click());
        assert.ok(!Array.from(view.host.querySelectorAll('textarea')).some((field) => field.value.includes('private')));
    } finally { await view.close(); }
});

test('log search, paging and page size use independent requests and preserve unsaved settings while clearing selections', async () => {
    const urls: string[] = [];
    request = async (url) => {
        urls.push(url);
        const query = new URL(url, 'https://oj.example').searchParams;
        return { ok: true, json: async () => ({ ...pageData(Number(query.get('page')), Number(query.get('pageSize'))), q: query.get('q') }) };
    };
    const view = await mount();
    try {
        const version = Array.from(view.host.querySelectorAll('label')).find((label) => label.textContent === 'Required client version')!.querySelector('input')!;
        await enter(version, '2.0.0-unsaved');
        const checkbox = view.host.querySelector('input[aria-label="Select all"]')! as HTMLInputElement;
        await act(async () => checkbox.click());
        assert.equal(checkbox.checked, true);
        await act(async () => button(view.host, 'Next page').click());
        assert.equal(version.value, '2.0.0-unsaved');
        assert.equal(checkbox.checked, false);
        assert.ok(view.host.textContent?.includes('final-2.hplog'));
        const select = view.host.querySelector('select')!;
        await act(async () => {
            select.value = '50';
            select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        assert.ok(urls.at(-1)?.includes('pageSize=50'));
        const search = view.host.querySelector('form input')! as HTMLInputElement;
        await enter(search, 'alice');
        await act(async () => view.host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
        assert.ok(urls.at(-1)?.includes('q=alice'));
        assert.equal(version.value, '2.0.0-unsaved');
    } finally { await view.close(); }
});
