import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import { getAvatarUrl } from '../src/utils/avatar.ts';
import { formatErrorMessage } from '../src/utils/error.ts';
import { avatarFrameInset, honorFrameImageUrl } from '../src/utils/honor-frame.ts';
import { formatUserName } from '../src/utils/user-name.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/a/', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
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
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

function component(path: string, mocks: Record<string, any>) {
    const code = transformSync(read(path), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    const module = { exports: {} as any };
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, URL,
        require: (id: string) => mocks[id] ?? require(id),
    });
    return module.exports;
}

const { FramedAvatar } = component('../src/components/user/framed-avatar.tsx', {
    '@/utils/honor-frame': { avatarFrameInset, honorFrameImageUrl },
});
const frame = { id: 'winner', name: 'Winner', imageUrl: 'https://cdn.example/frames/winner.webp' };
const user = { _id: 42, uname: 'Ada', avatar: 'url:https://cdn.example/avatar.png', honorFrame: frame };
let domain = 'a';
const { UserAvatar } = component('../src/components/user/user-avatar.tsx', {
    './framed-avatar': { FramedAvatar },
    '@/components/link': { Link: ({ params, children, ...props }: any) => h('a', { ...props, href: `/d/${domain}/user/${params.uid}` }, children) },
    '@/utils/avatar': { getAvatarUrl },
    '@/utils/user-name': { formatUserName },
});

async function mount(element: any, theme = 'light') {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = async (next: any) => act(async () => root.render(h(MantineProvider, { forceColorScheme: theme }, next)));
    await render(element);
    return {
        host, render,
        async close() {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

test('avatar decoration spacing is bounded for dense rows, profile sizes and custom sizes', () => {
    assert.equal(avatarFrameInset('xs'), 2);
    assert.equal(avatarFrameInset(32), 3);
    assert.equal(avatarFrameInset(96), 10);
    assert.equal(avatarFrameInset(10000), 10);
    assert.equal(avatarFrameInset(-1), 2);
    assert.equal(avatarFrameInset('3rem'), 4);
    assert.equal(avatarFrameInset(Number.NaN), 4);
});

test('frame URLs reject script/data URLs and malformed metadata', () => {
    for (const src of [null, {}, '', 'javascript:alert(1)', 'data:image/svg+xml,test', '//evil.example/frame', '/\\evil.example']) {
        assert.equal(honorFrameImageUrl(src), undefined);
    }
    assert.equal(honorFrameImageUrl('/frames/a.webp'), '/frames/a.webp');
    assert.equal(honorFrameImageUrl(frame.imageUrl), frame.imageUrl);
    assert.equal(honorFrameImageUrl('blob:https://oj.example/preview'), 'blob:https://oj.example/preview');
});

test('switching domain changes the user link, not the globally supplied frame', async () => {
    const view = await mount(h(UserAvatar, { user, size: 32 }));
    try {
        assert.equal(view.host.querySelector('a')?.getAttribute('href'), '/d/a/user/42');
        const inset = view.host.querySelector('.hydro-avatar-frame')?.getAttribute('style');
        assert.equal(view.host.querySelector('.hydro-avatar-frame__decoration')?.getAttribute('src'), frame.imageUrl);
        domain = 'b';
        await view.render(h(UserAvatar, { user: { ...user, displayName: 'Domain alias' }, size: 32 }));
        assert.equal(view.host.querySelector('a')?.getAttribute('href'), '/d/b/user/42');
        assert.equal(view.host.querySelector('.hydro-avatar-frame__decoration')?.getAttribute('src'), frame.imageUrl);
        assert.equal(view.host.querySelector('.hydro-avatar-frame')?.getAttribute('style'), inset);
    } finally { await view.close(); }
});

for (const theme of ['light', 'dark']) {
    test(`empty, loaded and failed frame states reserve identical space in ${theme} mode`, async () => {
        const view = await mount(h(FramedAvatar, { size: 80, alt: 'Ada' }), theme);
        try {
            const style = view.host.querySelector('.hydro-avatar-frame')?.getAttribute('style');
            await view.render(h(FramedAvatar, { size: 80, alt: 'Ada', frame }));
            const decoration = view.host.querySelector('.hydro-avatar-frame__decoration')!;
            assert.equal(decoration.getAttribute('aria-hidden'), 'true');
            assert.equal(decoration.getAttribute('alt'), '');
            assert.equal(view.host.querySelector('.hydro-avatar-frame')?.getAttribute('style'), style);
            await act(async () => decoration.dispatchEvent(new dom.window.Event('error')));
            assert.equal(view.host.querySelector('.hydro-avatar-frame__decoration'), null);
            assert.equal(view.host.querySelector('.hydro-avatar-frame')?.getAttribute('style'), style);
            await view.render(h(FramedAvatar, { size: 80, frame: { ...frame, imageUrl: '/new-frame.png' } }));
            assert.equal(view.host.querySelector('.hydro-avatar-frame__decoration')?.getAttribute('src'), '/new-frame.png');
        } finally { await view.close(); }
    });
}

test('user avatar inside a button does not create a nested profile link', async () => {
    const view = await mount(h('button', null, h(UserAvatar, { user, link: false, size: 32 })));
    try {
        assert.equal(view.host.querySelectorAll('a').length, 0);
        assert.equal(view.host.querySelectorAll('button').length, 1);
    } finally { await view.close(); }
});

const { FormDialog } = component('../src/components/common/form-dialog.tsx', {
    '@/components/common/button': {
        Button: ({ children, loading, disabled, type = 'button', onClick }: any) => h('button', {
            type, disabled: loading || disabled, onClick, 'data-loading': loading || undefined,
        }, children),
        UnstyledButton: 'button',
    },
    '@/components/common/select': { LongSelect: 'select' },
    '@/hooks/use-build-url': { useBuildUrl: () => () => '/' },
    '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    '@/utils/error': { formatErrorMessage },
});

test('form dialog handles async rejection, preserves input and blocks duplicate submissions and cancellation', async () => {
    let reject!: (error: Error) => void;
    let calls = 0;
    let closed = 0;
    const view = await mount(h(FormDialog, {
        opened: true, title: 'Edit name', onClose: () => closed++,
        fields: [{ name: 'name', label: 'Name', required: true, defaultValue: 'Ada' }],
        onSubmit: () => {
            calls++;
            return new Promise((_, fail) => { reject = fail; });
        },
    }));
    try {
        const dialog = document.querySelector('[role="dialog"]')!;
        const form = dialog.querySelector('form')!;
        await act(async () => {
            form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
            form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        });
        assert.equal(calls, 1);
        assert.equal(dialog.querySelector('fieldset')?.disabled, true);
        const cancel = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Cancel')!;
        assert.equal(cancel.disabled, true);
        await act(async () => cancel.click());
        assert.equal(closed, 0);
        await act(async () => reject(new Error('Save failed')));
        assert.equal(dialog.querySelector('[role="alert"]')?.textContent, 'Save failed');
        assert.equal(dialog.querySelector('input')?.value, 'Ada');
        assert.equal(dialog.querySelector('fieldset')?.disabled, false);
        await act(async () => cancel.click());
        assert.equal(closed, 1);
    } finally { await view.close(); }
});

let isAdmin = false;
const { HonorFramePanel } = component('../src/components/user/honor-frame-panel.tsx', {
    './framed-avatar': { FramedAvatar },
    '@/components/common/button': { Button: ({ children, disabled }: any) => h('button', { disabled }, children) },
    '@/hooks/use-current-user': { useCurrentUser: () => user },
    '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    '@/hooks/use-permission': { PRIV: { PRIV_EDIT_SYSTEM: 1 }, useHasPriv: () => isAdmin },
    '@/utils/avatar': { getAvatarUrl },
});

test('admin preview is hidden from ordinary users; personal equip action is explicitly unavailable', async () => {
    const view = await mount(h(HonorFramePanel, { administration: true }));
    try {
        assert.equal(view.host.querySelector('button'), null);
        assert.equal(view.host.querySelector('input'), null);
        await view.render(h(HonorFramePanel));
        assert.match(view.host.textContent!, /every domain/);
        assert.equal(view.host.querySelector('button')?.disabled, true);
        assert.match(view.host.querySelector('button')!.textContent!, /coming soon/);
    } finally { await view.close(); }
});

test('admin preview rejects SVG, stays local, and revokes replaced and unmounted object URLs', async () => {
    isAdmin = true;
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    const released: string[] = [];
    let created = 0;
    URL.createObjectURL = () => `blob:https://oj.example/preview-${++created}`;
    URL.revokeObjectURL = (url) => released.push(url);
    const view = await mount(h(HonorFramePanel, { administration: true }));
    try {
        const input = view.host.querySelector('input[type="file"]')!;
        const choose = async (type: string) => act(async () => {
            Object.defineProperty(input, 'files', { configurable: true, value: [new dom.window.File(['test'], 'frame', { type })] });
            input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        await choose('image/svg+xml');
        assert.equal(created, 0);
        assert.match(view.host.textContent!, /Choose a PNG or WebP/);
        await choose('image/png');
        assert.equal(created, 1);
        assert.equal(view.host.querySelector('.hydro-avatar-frame__decoration')?.getAttribute('src'), 'blob:https://oj.example/preview-1');
        await choose('image/webp');
        assert.equal(created, 2);
        assert.deepEqual(released, ['blob:https://oj.example/preview-1']);
        const publish = Array.from(view.host.querySelectorAll('button')).find((button) => button.textContent?.includes('Publish frame'));
        assert.equal(publish?.disabled, true);
        assert.doesNotMatch(read('../src/components/user/honor-frame-panel.tsx'), /fetch\(|localStorage|domainId/);
    } finally {
        await view.close();
        URL.createObjectURL = create;
        URL.revokeObjectURL = revoke;
        isAdmin = false;
    }
    assert.deepEqual(released, ['blob:https://oj.example/preview-1', 'blob:https://oj.example/preview-2']);
});
