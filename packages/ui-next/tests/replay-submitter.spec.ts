import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { formatUserName } from '../src/utils/user-name.ts';

const require = createRequire(import.meta.url);

test('replay shows the submitting users domain name, username, avatar and domain-aware link, with safe UID fallbacks', async () => {
    const { JSDOM } = require('jsdom');
    const { act, createElement: h } = require('react');
    const { createRoot } = require('react-dom/client');
    const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://oj.example/d/team/record/rid/replay' });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    const profile = { _id: 7, uname: 'student', displayName: '域内姓名', avatarUrl: '/avatar/student.png', honorFrame: { id: 'frame' } };
    let args: any;
    let response: any;
    const requests: string[] = [];
    const box = ({ children }: any) => h('div', null, children);
    const translate = (value: string) => value === 'Submit By' ? '提交者' : value;
    const mocks: any = {
        '@mantine/core': { Card: box, Group: box, Loader: () => null, Stack: box, Text: box, Title: box },
        '@tabler/icons-react': { IconArrowLeft: () => null },
        '@/components/common/button': { Button: ({ children, onClick }: any) => h('button', { onClick }, children) },
        '@/components/record/code-replay': { CodeReplay: () => h('div', { 'data-replay-player': true }) },
        '@/components/user/user-avatar': { UserAvatar: ({ user }: any) => h('img', { src: user.avatarUrl, alt: formatUserName(user) }) },
        '@/components/link': { Link: ({ children, params }: any) => h('a', { href: `/d/team/user/${params.uid}` }, children) },
        '@/hooks/use-i18n': { useI18n: () => ({ t: translate }) },
        '@/utils/user-name': { formatUserName },
        '@/utils/history-back': { goBackOrFallback: () => undefined },
        '@/utils/proctor': { proctorAccessHeaders: async () => ({ 'x-proctor-proof': 'signed' }) },
        '@/context/page-data': { usePageData: () => ({ args }), useUiContext: () => ({ codeReplayDataUrl: '/d/team/record/rid/replay/data' }) },
        '@/context/router': { useNavigate: () => () => undefined },
        '@/hooks/use-build-url': { useBuildUrl: () => () => '/d/team/record' },
    };
    function load(path: string) {
        const module = { exports: {} as any };
        const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
        runInNewContext(code, { module, exports: module.exports, AbortController, window: dom.window,
            fetch: async (url: string, options: any) => {
                assert.equal(options.headers['x-proctor-proof'], 'signed');
                requests.push(url);
                return { ok: true, json: async () => response };
            },
            require: (name: string) => mocks[name] || require(name) });
        return module.exports;
    }
    mocks['@/components/user/user-link'] = load('../src/components/user/user-link.tsx');
    const Page = load('../src/pages/code_replay.tsx').default;
    const root = createRoot(dom.window.document.getElementById('root'));
    try {
        for (const [index, user] of [profile, null, { ...profile, _id: 99, uname: 'viewer', displayName: '查看者' }].entries()) {
            args = { rdoc: { _id: 'rid', uid: 7 }, pdoc: { title: 'Problem', docId: 1 }, udoc: profile };
            response = { ...args, udoc: user, replay: { _id: `replay-${index}`, uid: 7, events: [] } };
            // eslint-disable-next-line no-await-in-loop
            await act(async () => root.render(h(Page, { key: index })));
            const text = dom.window.document.body.textContent || '';
            assert.ok(text.includes('提交者'));
            assert.ok(text.includes('UID 7'));
            assert.ok(!text.includes('查看者') && !text.includes('viewer'));
            assert.ok(dom.window.document.querySelector('[data-replay-player]'));
            if (user === profile) {
                assert.ok(text.includes('域内姓名 (student)'));
                assert.equal(dom.window.document.querySelector('a')?.getAttribute('href'), '/d/team/user/7');
                assert.equal(dom.window.document.querySelector('img')?.getAttribute('src'), profile.avatarUrl);
            } else {
                assert.equal(dom.window.document.querySelector('a'), null);
                assert.equal(dom.window.document.querySelector('img'), null);
            }
        }
        assert.equal(requests.length, 3, 'Submitter information must not require another fetch');
        assert.ok(requests.every((url) => url === '/d/team/record/rid/replay/data'));
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});
