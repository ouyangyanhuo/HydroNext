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
    Document: dom.window.Document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
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

function component(path: string, mocks: Record<string, any>, globals: Record<string, any> = {}) {
    const code = transformSync(read(path), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    const module = { exports: {} as any };
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, URL, AbortController, FormData, File,
        require: (id: string) => mocks[id] ?? require(id),
        ...globals,
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
let sessionUser: any = { ...user, honorFrame: null };
const notices: any[] = [];
const t = (key: string) => key;
let request: (url: string, options?: any) => Promise<any> = async () => ({ frames: [frame], page: 1, pageCount: 1, honorFrame: null });
const { HonorFramePanel } = component('../src/components/user/honor-frame-panel.tsx', {
    './framed-avatar': { FramedAvatar },
    './honor-frame-preview': { HonorFramePreview: ({ frame: decoration }: any) => h(FramedAvatar, { frame: decoration, size: 40 }) },
    '@/components/common/button': {
        Button: ({ children, disabled, loading, onClick }: any) => h('button', { disabled: disabled || loading, onClick }, children),
    },
    '@/components/link': { Link: () => null },
    '@/hooks/use-build-url': { useBuildUrl: () => () => `/d/${domain}/home/honor-frames` },
    '@/hooks/use-current-user': { useCurrentUser: () => sessionUser },
    '@/hooks/use-i18n': { useI18n: () => ({ t }) },
    '@/hooks/use-permission': { PRIV: { PRIV_EDIT_SYSTEM: 1 }, useHasPriv: () => isAdmin },
    '@/stores/session': { useSessionStore: { setState: (update: any) => { sessionUser = update({ user: sessionUser }).user; } } },
    '@/utils/honor-frame-api': { requestHonorFrame: (url: string, options: any) => request(url, options) },
    '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
    '@/utils/avatar': { getAvatarUrl },
});

test('management is hidden from ordinary users and opens the real management entry for admins', async () => {
    const view = await mount(h(HonorFramePanel, { administration: true }));
    try {
        assert.equal(view.host.querySelector('button'), null);
        assert.equal(view.host.querySelector('input'), null);
        isAdmin = true;
        await view.render(h(HonorFramePanel, { administration: true }));
        assert.equal(view.host.querySelector('button')?.disabled, false);
        assert.match(view.host.querySelector('button')!.textContent!, /Manage honor frames/);
        assert.doesNotMatch(view.host.textContent!, /coming soon/);
    } finally { await view.close(); isAdmin = false; }
});

test('wardrobe loads owned frames, serializes equip requests, updates the session and supports unequipping', async () => {
    sessionUser = { ...user, honorFrame: null };
    let resolve!: (result: any) => void;
    let writes = 0;
    request = async (_url, options) => {
        if (options.method === 'POST') {
            writes++;
            return new Promise((done) => { resolve = done; });
        }
        return { frames: [frame], page: 1, pageCount: 1, honorFrame: null };
    };
    const view = await mount(h(HonorFramePanel));
    try {
        assert.match(view.host.textContent!, /every domain/);
        const equip = Array.from(view.host.querySelectorAll('button')).find((button) => button.textContent === 'Equip frame')!;
        await act(async () => {
            equip.click();
            equip.click();
        });
        assert.equal(writes, 1);
        assert.equal(equip.disabled, true);
        await act(async () => resolve({ honorFrame: frame }));
        assert.equal(sessionUser.honorFrame.id, frame.id);
        assert.ok(Array.from(view.host.querySelectorAll('button')).some((button) => button.textContent === 'Equipped' && button.disabled));
        const unequip = Array.from(view.host.querySelectorAll('button')).find((button) => button.textContent === 'Unequip frame')!;
        await act(async () => unequip.click());
        await act(async () => resolve({ honorFrame: null }));
        assert.equal(sessionUser.honorFrame, null);
        assert.equal(writes, 2);
    } finally { await view.close(); }
});

test('failed equipping leaves the current frame intact and reports a notification', async () => {
    request = async (_url, options) => {
        if (options.method === 'POST') throw new Error('Award was revoked');
        return { frames: [frame], page: 1, pageCount: 1, honorFrame: null };
    };
    const view = await mount(h(HonorFramePanel));
    try {
        const equip = Array.from(view.host.querySelectorAll('button')).find((button) => button.textContent === 'Equip frame')!;
        await act(async () => equip.click());
        assert.equal(sessionUser.honorFrame, null);
        assert.equal(equip.disabled, false);
        assert.equal(notices.at(-1).message, 'Award was revoked');
    } finally { await view.close(); }
});

test('closing the wardrobe cancels loading and cannot update the session from a late response', async () => {
    let signal!: AbortSignal;
    let resolve!: (result: any) => void;
    request = async (_url, options) => {
        signal = options.signal;
        return new Promise((done) => { resolve = done; });
    };
    const view = await mount(h(HonorFramePanel));
    await view.close();
    assert.equal(signal.aborted, true);
    await act(async () => resolve({ frames: [frame], page: 1, pageCount: 1, honorFrame: frame }));
    assert.equal(sessionUser.honorFrame, null);
});

test('artwork conversion validates before decoding, caps dimensions, and releases bitmap and canvas resources', async () => {
    let decoded = 0;
    let closed = 0;
    let width = 64;
    const canvas = {
        width: 0, height: 0, getContext: () => ({ drawImage() {} }),
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'], { type: 'image/png' })),
    };
    const { prepareFrameArtwork } = component('../src/utils/honor-frame-api.ts', { './error': { formatErrorMessage } }, {
        createImageBitmap: async () => {
            decoded++;
            return { width, height: width, close: () => closed++ };
        },
        document: { createElement: () => canvas },
    });
    await assert.rejects(prepareFrameArtwork(new File(['svg'], 'a.svg', { type: 'image/svg+xml' })));
    assert.equal(decoded, 0);
    const output = await prepareFrameArtwork(new File(['webp'], 'a.webp', { type: 'image/webp' }));
    assert.equal(output.type, 'image/png');
    assert.equal(output.name, 'honor-frame.png');
    assert.equal(closed, 1);
    assert.equal(canvas.width, 0);
    width = 4096;
    await assert.rejects(prepareFrameArtwork(new File(['png'], 'a.png', { type: 'image/png' })), /square/);
    assert.equal(closed, 2);
    assert.equal(canvas.width, 0);
});

test('artwork upload errors retain the shape and translatable reason instead of a generic field error', async () => {
    await Promise.all(['square', 'circle'].map(async (shape) => {
        const { requestHonorFrame } = component('../src/utils/honor-frame-api.ts', { './error': { formatErrorMessage } }, {
            fetch: async () => ({ ok: false, json: async () => ({ error: {
                message: 'Field {0} validation failed. ({2})',
                params: [shape, null, 'Frame artwork must be 512 × 512 px.'],
            } }) }),
        });
        await assert.rejects(requestHonorFrame('/manage/honor-frames'), (error: any) => {
            assert.equal(error.frameShape, shape);
            assert.equal(error.message, 'Frame artwork must be 512 × 512 px.');
            return true;
        });
    }));
});

test('management upload preserves failed drafts, posts normalized files and never submits twice', async () => {
    const sent: any[] = [];
    const paths: string[] = [];
    let resolve!: (value: any) => void;
    let reject!: (value: any) => void;
    const { useHonorFrameMutation } = component('../src/hooks/use-honor-frame-mutation.ts', {
        '@/context/router': { useNavigate: () => async (url: string) => { paths.push(url); } },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/d/a/manage/honor-frames' },
        '@/hooks/use-i18n': { useI18n: () => ({ t }) },
        '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
        '@/utils/honor-frame-api': {
            requestHonorFrame: async (url: string, options: any) => {
                sent.push([url, options]);
                return new Promise((ok, fail) => {
                    resolve = ok;
                    reject = fail;
                });
            },
        },
    });
    const { default: ManagePage } = component('../src/pages/manage_honor_frame_upload.tsx', {
        '@/hooks/use-honor-frame-mutation': { useHonorFrameMutation },
        '@/components/common/button': {
            UnstyledButton: ({ children, ...props }: any) => h('button', { ...props, type: 'button' }, children),
            Button: ({ children, onClick, disabled, loading, type = 'button' }: any) => h('button', {
                onClick, disabled: disabled || loading, type,
            }, children),
        },
        '@/components/common/confirm-dialog': { ConfirmDialog: () => null },
        '@/components/common/form-dialog': { FormDialog },
        '@/components/common/page-header': { PageHeader: ({ children }: any) => h('header', null, children) },
        '@/components/common/paginator': { Paginator: () => null },
        '@/components/link': { Link: () => null },
        '@/components/user/framed-avatar': { FramedAvatar },
        '@/context/page-data': { usePageData: () => ({ args: { frames: [] } }) },
        '@/context/router': { useNavigate: () => async (url: string) => { paths.push(url); } },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/d/a/manage/honor-frames' },
        '@/hooks/use-current-user': { useCurrentUser: () => user },
        '@/hooks/use-i18n': { useI18n: () => ({ t }) },
        '@/hooks/use-object-url': { useObjectUrl: (file: File | null) => (file ? 'blob:preview' : '') },
        '@/hooks/use-permission': { PRIV: { PRIV_EDIT_SYSTEM: 1 }, useHasPriv: () => true },
        '@/utils/avatar': { getAvatarUrl },
        '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
        '@/utils/honor-frame-api': {
            prepareFrameArtwork: async () => new File(['normalized'], 'honor-frame.png', { type: 'image/png' }),
            requestHonorFrame: async (url: string, options: any) => {
                sent.push([url, options]);
                return new Promise((ok, fail) => {
                    resolve = ok;
                    reject = fail;
                });
            },
        },
    });
    const view = await mount(h(ManagePage));
    try {
        const input = document.querySelector<HTMLInputElement>('input:not([type="file"]):not([readonly])')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Champion');
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
            for (const chooser of document.querySelectorAll('input[type="file"]')) {
                Object.defineProperty(chooser, 'files', {
                    configurable: true,
                    value: [new dom.window.File(['png'], 'source.png', { type: 'image/png' })],
                });
                chooser.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
            }
        });
        const form = document.querySelector('form')!;
        await act(async () => {
            form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
            form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        });
        assert.equal(sent.length, 1);
        assert.equal(sent[0][0], '/d/a/manage/honor-frames');
        assert.equal(sent[0][1].body.get('name'), 'Champion');
        assert.equal(sent[0][1].body.get('square').name, 'honor-frame.png');
        await act(async () => reject(new Error('Upload rejected')));
        assert.equal(input.value, 'Champion');
        assert.equal(sent[0][1].body.get('circle').name, 'honor-frame.png');
        assert.equal(notices.at(-1).message, 'Upload rejected');
        await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
        assert.equal(sent.length, 2);
        await act(async () => resolve({ ok: true }));
        assert.equal(paths.length, 1);
    } finally { await view.close(); }
});

test('paired frame assets follow the avatar shape at an exact 512:384 ratio', async () => {
    const pair = { ...frame, artworkVersion: 2, circleImageUrl: '/circle.png', squareImageUrl: '/square.png' };
    const view = await mount(h(FramedAvatar, { frame: pair, size: 96, shape: 'circle' }));
    try {
        assert.equal(view.host.querySelector('.hydro-avatar-frame__decoration')?.getAttribute('src'), '/circle.png');
        assert.match(view.host.querySelector('.hydro-avatar-frame')?.getAttribute('style') || '', /16px/);
        await view.render(h(FramedAvatar, { frame: pair, size: 96, shape: 'square' }));
        assert.equal(view.host.querySelector('.hydro-avatar-frame__decoration')?.getAttribute('src'), '/square.png');
    } finally { await view.close(); }
});

test('grant dialog searches within the current domain and submits one frame with multiple users', async () => {
    const requests: string[] = [];
    const awards: any[] = [];
    let closed = 0;
    const selectStyles = component('../src/components/common/select-styles.ts', {});
    const selects = component('../src/components/common/select.tsx', { './select-styles': selectStyles });
    const { HonorFrameGrantDialog } = component('../src/components/user/honor-frame-grant-dialog.tsx', {
        '@/components/common/form-dialog': { FormDialog },
        '@/components/common/select': selects,
        '@/hooks/use-build-url': { useBuildUrl: () => (_name: string, _params: any, query: any) =>
            `/d/a/manage/honor-frames/search?${new URLSearchParams(query)}` },
        '@/hooks/use-i18n': { useI18n: () => ({ t }) },
        '@/utils/honor-frame-api': { requestHonorFrame: async (url: string) => {
            requests.push(url);
            const q = new URL(url, 'https://oj.example').searchParams.get('q');
            return { options: url.includes('kind=frames') ? q === '冠'
                ? [{ value: 'frame-id', label: '冠军 Champion' }, { value: 'disabled-id', label: '旧冠军', disabled: true }] : []
                : [{ value: '42', label: 'Ada (#42)' }, { value: '43', label: 'Bob (#43)' }] };
        } },
    });
    const view = await mount(h(HonorFrameGrantDialog, {
        opened: true, onClose: () => closed++, busy: false,
        onGrant: async (frameId: string, uids: number[]) => { awards.push([frameId, uids]); return true; },
    }));
    try {
        await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
        const inputs = document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[role="combobox"]');
        await act(async () => inputs[0].click());
        assert.equal(inputs[0].readOnly, false);
        await act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(inputs[0], '冠');
            inputs[0].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
        assert.equal(inputs[0].value, '冠');
        assert.ok(requests.some((url) => new URL(url, 'https://oj.example').searchParams.get('q') === '冠'));
        const option = (label: string) => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
            .find((node) => node.textContent?.includes(label))!;
        assert.ok(option('旧冠军').textContent?.includes('Disabled'));
        assert.equal(option('旧冠军').getAttribute('data-combobox-disabled'), 'true');
        await act(async () => option('Champion').click());
        await act(async () => inputs[1].click());
        await act(async () => option('Ada').click());
        await act(async () => inputs[1].click());
        await act(async () => option('Bob').click());
        await act(async () => document.querySelector('[role="dialog"] form')!
            .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
        assert.equal(JSON.stringify(awards), JSON.stringify([['frame-id', [42, 43]]]));
        assert.equal(closed, 1);
        assert.ok(requests.length >= 2 && requests.every((url) => url.startsWith('/d/a/')));
    } finally { await view.close(); }
});

test('management cards rename inline and confirm status changes without stale name writes', async () => {
    const writes: any[] = [];
    const buttons = component('../src/components/common/button.tsx', {});
    const { ConfirmDialog } = component('../src/components/common/confirm-dialog.tsx', {
        '@/components/common/button': buttons,
        '@/hooks/use-i18n': { useI18n: () => ({ t }) },
    });
    const { default: ManagePage } = component('../src/pages/manage_honor_frames.tsx', {
        '@/components/common/button': buttons,
        '@/components/common/confirm-dialog': { ConfirmDialog },
        '@/components/common/page-header': { PageHeader: ({ children }: any) => h('header', null, children) },
        '@/components/common/paginator': { Paginator: () => null },
        '@/components/link': { Link: ({ children }: any) => h('a', null, children) },
        '@/components/user/honor-frame-grant-dialog': { HonorFrameGrantDialog: () => null },
        '@/components/user/honor-frame-preview': { HonorFramePreview: () => null },
        '@/context/page-data': { usePageData: () => ({ args: { frames: [{ ...frame, active: true }] } }) },
        '@/context/router': { useNavigate: () => async () => {} },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/d/a/manage/honor-frames' },
        '@/hooks/use-current-user': { useCurrentUser: () => user },
        '@/hooks/use-honor-frame-mutation': { useHonorFrameMutation: () => ({ busy: false, run: async (body: any) => {
            writes.push(body);
            return true;
        } }) },
        '@/hooks/use-i18n': { useI18n: () => ({ t }) },
        '@/hooks/use-permission': { PRIV: { PRIV_EDIT_SYSTEM: 1 }, useHasPriv: () => true },
    });
    const view = await mount(h(ManagePage));
    try {
        const status = view.host.querySelector<HTMLButtonElement>('button[aria-label="winner: Unpublish"]')
            || view.host.querySelector<HTMLButtonElement>('button[aria-label="Winner: Unpublish"]')!;
        await act(async () => status.click());
        assert.equal(writes.length, 0);
        const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
            .find((button) => button.textContent === 'Confirm')!;
        await act(async () => confirm.click());
        assert.equal(JSON.stringify(writes[0]), JSON.stringify({ operation: 'status', id: 'winner', active: false }));
        assert.ok(!view.host.textContent?.includes('Click to rename'));
        await act(async () => view.host.querySelector<HTMLButtonElement>('[aria-label="Rename: Winner"]')!.click());
        const input = view.host.querySelector<HTMLInputElement>('input[aria-label="Frame name"]')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Renamed');
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        await act(async () => input.closest('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
        assert.equal(JSON.stringify(writes[1]), JSON.stringify({ operation: 'rename', id: 'winner', name: 'Renamed' }));
        await act(async () => view.host.querySelector<HTMLButtonElement>('[aria-label="Delete frame: Winner"]')!.click());
        assert.equal(writes.length, 2);
        const deletion = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
            .find((button) => button.textContent === 'Confirm')!;
        await act(async () => deletion.click());
        assert.equal(JSON.stringify(writes[2]), JSON.stringify({ operation: 'delete', id: 'winner' }));
    } finally { await view.close(); }
});
