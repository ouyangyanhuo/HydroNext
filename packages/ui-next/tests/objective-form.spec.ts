import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { load } from 'js-yaml';
import { test } from 'node:test';
import { attachCodeCopyButtons } from '../src/components/markdown/code-copy.ts';
import { markdownXssPlugin } from '../src/components/markdown/markdown-xss.ts';
import { attachObjectiveInputs } from '../src/components/markdown/objective-inputs.ts';
import { sampleIOPlugin } from '../src/components/markdown/sample-io.ts';
import { tableCompatibilityPlugin } from '../src/components/markdown/table-compat.ts';
import { extractLocalizedContent } from '../src/utils/i18n-content.ts';
import * as drafts from '../src/utils/objective-answers.ts';
import { getSubmissionRecordQuery } from '../src/utils/problem-navigation.ts';
import { formatUserName } from '../src/utils/user-name.ts';

const require = createRequire(import.meta.url);

test('objective form restores drafts, retains answers across language changes, signs submissions, handles failures and clears answers', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/d/test/p/P42?tid=0123456789abcdef01234567', pretendToBeVisual: true });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, getComputedStyle: dom.window.getComputedStyle,
        localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
        requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
        cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    }
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const React = require('react');
    const { act, createElement: h } = React;
    const { createRoot } = require('react-dom/client');
    const { MantineProvider } = require('@mantine/core');
    const tid = '0123456789abcdef01234567';
    const draftKey = drafts.objectiveDraftKey(7, 'test', 42, tid);
    dom.window.localStorage.setItem(draftKey, JSON.stringify({ version: 1, answers: { 1: '001', 2: ['B'] } }));
    const navigations: string[] = [];
    const signed: any[] = [];
    const requests: any[] = [];
    let failure = true;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const buildUrl = (name: string, params: any, query: any) => `/${name}/${params.rid || params.tid}?${new URLSearchParams(query)}`;
    const mocks: Record<string, any> = {
        'js-yaml': { dump: (value: any, options: any) => require('js-yaml').dump(JSON.parse(JSON.stringify(value)), options) },
        '@/components/common/button': require('@mantine/core'),
        '@/context/page-data': {
            usePageData: () => ({ args: { tdoc: { docId: tid, proctorEnabled: true } } }),
            useUiContext: () => ({ domainId: 'test' }), useUserContext: () => ({ _id: 7 }),
        },
        '@/context/router': { useNavigate: () => (url: string) => navigations.push(url) },
        '@/hooks/use-build-url': { useBuildUrl: () => buildUrl },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/stores/session': { useSessionStore: (selector: any) => selector({ language: 'en', ui: { domainId: 'test' } }) },
        '@/registry/request-security': {
            protectedSubmissionHeaders: async (...args: any[]) => { signed.push(args); return { 'x-proctor-proof': 'proof' }; },
        },
        '@/utils/objective-answers': drafts,
        '@/utils/i18n-content': { extractLocalizedContent },
        '@/utils/user-name': { formatUserName },
        '@/utils/problem-navigation': { getSubmissionRecordQuery },
        '@/utils/request': { formatRequestError: (error: any) => error?.message || 'Submission failed' },
        '@/components/markdown/objective-inputs': { attachObjectiveInputs },
        './code-copy': { attachCodeCopyButtons }, './markdown-xss': { markdownXssPlugin },
        './sample-io': { sampleIOPlugin }, './table-compat': { tableCompatibilityPlugin },
        './objective.css': {},
    };
    const loadComponent = (path: string) => {
        const module = { exports: {} as any };
        runInNewContext(transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'),
            { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
            module, exports: module.exports, URLSearchParams,
            require: (name: string) => mocks[name] || require(name), window, document, URL, AbortController,
            fetch: async (url: string, options: any) => {
                requests.push({ url, ...options });
                await pending;
                return { ok: !failure, json: async () => failure ? { error: { message: 'Try again' } } : { rid: 'record-id' } };
            },
        });
        return module.exports;
    };
    mocks['@/components/common/confirm-dialog'] = loadComponent('../src/components/common/confirm-dialog.tsx');
    mocks['@/components/markdown/markdown-renderer'] = loadComponent('../src/components/markdown/markdown-renderer.tsx');
    const { ObjectiveAnswerForm, ObjectiveMarkdown } = loadComponent('../src/components/problem/objective-answer-form.tsx');
    const root = createRoot(document.getElementById('root'));
    const content = '{{ input(1) }}\n\n{{ multiselect(2) }}\n\n- A\n- **B**';
    const render = (disabled = false, language = 'en', formKey = 'first') => root.render(h(MantineProvider, {},
        h(React.StrictMode, {}, h(ObjectiveAnswerForm, {
            key: formKey, pid: 42, tid, submitUrl: `/d/test/p/P42/submit?tid=${tid}`, disabled, disabledReason: 'Contest Closed',
        }, h(ObjectiveMarkdown, { content: language === 'en' ? content : `Translated\n\n${content}`, language })))));
    const dispatchSubmit = () => document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    try {
        await act(async () => render());
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '001');
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].checked);
        assert.match(document.body.textContent!, /Answered: 2\/2/);
        await act(async () => {
            const input = document.querySelector<HTMLInputElement>('input[type=text]')!;
            input.value = '0';
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        assert.equal(drafts.readObjectiveDraft(dom.window.localStorage, draftKey)['1'], '0');
        await act(async () => render(false, 'zh'));
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '0');
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].checked);
        await act(async () => render(true));
        assert.ok(document.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled);
        assert.ok([...document.querySelectorAll<HTMLInputElement>('input')].every((input) => input.disabled));
        await act(async () => { dispatchSubmit(); });
        assert.equal(requests.length, 0);
        await act(async () => render());
        await act(async () => {
            dispatchSubmit();
            dispatchSubmit();
        });
        assert.equal(requests.length, 1, 'a pending submission cannot be sent twice');
        assert.equal(signed[0][0], true);
        assert.equal(signed[0][1], requests[0].url);
        const body = JSON.parse(requests[0].body);
        assert.equal(body.lang, '_');
        assert.deepEqual(load(body.code), { 1: '0', 2: ['B'] });
        assert.equal(signed[0][2].code, body.code);
        assert.equal(signed[0][2].pid, 42);
        assert.equal(requests[0].headers['x-proctor-proof'], 'proof');
        await act(async () => release());
        assert.match(document.querySelector('[role=alert]')!.textContent!, /Try again/);
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '0');
        failure = false;
        await act(async () => { dispatchSubmit(); });
        assert.equal(navigations.length, 1);
        assert.match(navigations[0], /record_detail\/record-id\?problemNav=/);
        await act(async () => render(false, 'en', 'remounted'));
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '0');
        await act(async () => { [...document.querySelectorAll('button')].find((button) => button.textContent === 'Clear answers')!.click(); });
        await act(async () => { [...document.querySelectorAll('button')].find((button) => button.textContent === 'Confirm')!.click(); });
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '');
        assert.ok([...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].every((input) => !input.checked));
        assert.deepEqual(drafts.readObjectiveDraft(dom.window.localStorage, draftKey), {});
        const storageDescriptor = Object.getOwnPropertyDescriptor(dom.window, 'localStorage')!;
        Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
        try {
            await act(async () => {
                const input = document.querySelector<HTMLInputElement>('input[type=text]')!;
                input.value = 'still editable';
                input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
            });
            assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, 'still editable');
            assert.match(document.body.textContent!, /Save failed/);
        } finally { Object.defineProperty(dom.window, 'localStorage', storageDescriptor); }
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as any)[key];
        }
    }
});
