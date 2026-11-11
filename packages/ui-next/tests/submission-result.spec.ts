import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import postcss from 'postcss';
import { resolveLanguagePreference } from '../src/components/editor/editor-language.ts';
import * as submissionContext from '../src/components/editor/submission-context.ts';
import * as statuses from '../src/components/record/status-map.ts';
import { objectiveCaseId } from '../src/utils/objective-answers.ts';
import * as navigation from '../src/utils/problem-navigation.ts';

const require = createRequire(import.meta.url);

test('formal editor submissions stay in a compact live modal and close according to the latest result', async () => {
    const { JSDOM } = require('jsdom');
    const tid = '0123456789abcdef01234567';
    const dom = new JSDOM('<div id="root"></div>', {
        url: `https://oj.example/d/team/p/P42?tid=${tid}&mode=code`, pretendToBeVisual: true,
    });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
        ShadowRoot: dom.window.ShadowRoot, Document: dom.window.Document,
        getComputedStyle: dom.window.getComputedStyle, localStorage: dom.window.localStorage,
        ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
        requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
        cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    const { act, createElement: h, StrictMode } = require('react');
    const { createRoot } = require('react-dom/client');
    const mantine = require('@mantine/core');
    let now = Date.now();
    class TestDate extends Date { static now() { return now; } }
    const intervals = new Map<number, () => void>();
    let nextInterval = 0;
    dom.window.setInterval = (callback: () => void) => {
        intervals.set(++nextInterval, callback);
        return nextInterval;
    };
    dom.window.clearInterval = (id: number) => { intervals.delete(id); };
    const translate = (key: string) => key;
    let counter = 0;
    let fail = false;
    let quitCount = 0;
    const requests: any[] = [];
    const signed: any[] = [];
    const completed: string[] = [];
    const actions: string[] = [];
    const notices: any[] = [];
    const navigated: string[] = [];
    const updates = new Map<string, any>();
    const user: { _id: number, codeLang?: string } = { _id: 7 };
    const ui = { domainId: 'team' };
    const args = { pdoc: { docId: 42, config: { type: 'default' } }, tdoc: { docId: tid, proctorEnabled: true } };
    const addon = {
        initialize: async (code: string) => code, capture() {}, change() {},
        action: (action: string) => actions.push(action),
        beforeSubmit: async () => ({ fields: { replaySession: 'session' }, complete: async (data: any) => completed.push(data.rid) }),
    };
    const buildUrl = (_name: string, params: any, query: any = {}) => `/d/team/record/${params.rid}?${new URLSearchParams(query)}`;
    const Allotment = Object.assign(({ children }: any) => h('div', {}, children), {
        Pane: ({ children }: any) => h('div', {}, children),
    });
    const mocks: Record<string, any> = {
        'allotment/dist/style.css': {}, allotment: { Allotment },
        '@mantine/notifications': { notifications: { show: (notice: any) => notices.push(notice) } },
        '@/components/common/button': { ...mantine, ButtonBase: mantine.UnstyledButton },
        '@/components/common/rolling-clock': { RollingClock: ({ value }: any) => value },
        '@/components/common/select': { ShortSelect: mantine.Select, LongSelect: mantine.Select },
        '@/hooks/use-i18n': { useI18n: () => ({ t: translate }) },
        '@/hooks/use-build-url': { useBuildUrl: () => buildUrl },
        '@/context/router': { useNavigate: () => async (url: string) => { navigated.push(url); } },
        '@/context/page-data': { usePageData: () => ({ args }), useUiContext: () => ui, useUserContext: () => user },
        '@/hooks/use-record-socket': { useRecordSocket: (rid?: string) => updates.get(rid || '') || null },
        '@/registry/request-security': {
            protectedSubmissionHeaders: async (...values: any[]) => { signed.push(values); return { 'x-proctor-proof': 'signed' }; },
        },
        '@/utils/problem-navigation': navigation,
        '@/utils/objective-answers': { objectiveCaseId },
        '@/utils/request': { formatRequestError: (error: any) => error.message },
        './addons': { createEditorAddon: () => addon },
        './code-templates': { getCodeTemplate: () => 'int main() {}' },
        './submission-context': submissionContext,
        './editor-language': { resolveLanguagePreference },
        './code-editor': {
            CodeEditor: ({ value, onChange, documentOnlySuggestions }: any) => h('textarea', {
                'aria-label': 'Code', 'data-document-only': documentOnlySuggestions, value, onChange: (event: any) => onChange(event.target.value),
            }),
            loadStoredEditorConfig: () => ({}), saveStoredEditorConfig() {}, EDITOR_THEME_OPTIONS: [],
        },
        './status-map': statuses, '@/components/record/status-map': statuses,
    };
    const loadComponent = (path: string) => {
        const module = { exports: {} as any };
        const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
            loader: 'tsx', format: 'cjs', jsx: 'automatic',
        }).code;
        runInNewContext(code, {
            module, exports: module.exports, document, window, localStorage, Date: TestDate, URL, URLSearchParams, AbortController,
            require: (id: string) => mocks[id] || require(id),
            fetch: async (url: string, options: any) => {
                requests.push({ url, ...options });
                return { ok: !fail, json: async () => fail ? { error: { message: 'Denied' } } : { rid: `record-${++counter}` } };
            },
        });
        return module.exports;
    };
    const badge = loadComponent('../src/components/record/record-status-badge.tsx');
    mocks['./record-status-badge'] = badge;
    mocks['@/components/record/record-status-badge'] = badge;
    mocks['@/components/record/submission-result-modal'] = loadComponent('../src/components/record/submission-result-modal.tsx');
    const { Scratchpad } = loadComponent('../src/components/editor/scratchpad.tsx');
    const root = createRoot(document.getElementById('root'));
    const langs = { cc: { display: 'C++', pretest: true }, py: { display: 'Python' }, js: { display: 'NodeJS' } };
    const render = async (key = 'first') => {
        await act(async () => root.render(h(mantine.MantineProvider, { env: 'test' }, h(StrictMode, {}, h(Scratchpad, {
            key, pid: 'P42', langs, onClose: () => { quitCount++; },
        })))));
    };
    const findButton = (text: string, scope: ParentNode = document) => {
        const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.startsWith(text));
        assert.ok(result, `Missing button: ${text}`);
        return result;
    };
    const submit = async () => {
        now += 6000;
        await act(async () => { for (const tick of [...intervals.values()]) tick(); });
        await act(async () => { findButton('Submit Solution').click(); });
    };
    try {
        await render();
        assert.equal(document.querySelector('[aria-label=Code]')!.getAttribute('data-document-only'), 'true');
        await submit();
        assert.equal(navigated.length, 0, 'formal submissions must not leave the editor');
        assert.deepEqual(completed, ['record-1'], 'replay association is retained');
        assert.match(document.querySelector('[role=dialog]')!.textContent!, /Waiting/);
        assert.equal(document.querySelector<HTMLTextAreaElement>('[aria-label=Code]')!.value, 'int main() {}');
        assert.match(requests[0].url, new RegExp(`^/d/team/p/P42/submit\\?tid=${tid}$`));
        assert.equal(requests[0].headers['x-proctor-proof'], 'signed');
        assert.equal(JSON.parse(requests[0].body).replaySession, 'session');
        assert.equal(signed[0][2].pid, 42);
        updates.set('record-1', {
            status: 2, score: 40, time: 123, memory: 456, lang: 'SECRET_LANGUAGE', code: 'SECRET_SOURCE',
            testCases: Array.from({ length: 100 }, (_, index) => ({ id: index + 1, status: index < 40 ? 1 : 2 })),
        });
        await render();
        const dialog = document.querySelector('[role=dialog]')!;
        assert.match(dialog.textContent!, /Wrong Answer/);
        assert.match(dialog.textContent!, /Score40/);
        assert.equal(dialog.querySelectorAll('li').length, 100);
        assert.ok(dialog.querySelector('.mantine-ScrollArea-viewport[tabindex="0"]'));
        assert.doesNotMatch(dialog.textContent!, /SECRET|Total Time|Peak Time|Peak Memory|Language|123ms|456/);
        updates.set('record-1', { ...updates.get('record-1'), error: { name: 'RecordConnectionError' } });
        await render();
        assert.match(document.querySelector('[role=dialog] [role=alert]')!.textContent!, /Live results disconnected/);
        await act(async () => { findButton('Close', dialog).click(); });
        assert.equal(document.querySelector('[role=dialog]'), null);
        assert.equal(quitCount, 0, 'a failed result keeps the editor open');

        await submit();
        assert.match(document.querySelector('[role=dialog]')!.textContent!, /Waiting/);
        assert.doesNotMatch(document.querySelector('[role=dialog]')!.textContent!, /Wrong Answer/);
        await act(async () => {
            document.querySelector('[role=dialog]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        assert.equal(document.querySelector('[role=dialog]'), null);
        updates.set('record-2', { status: 1, score: 100, testCases: [] });
        await render();
        assert.equal(quitCount, 0, 'a result arriving after dismissal must never unexpectedly leave the editor');
        assert.equal(document.querySelector('[role=dialog]'), null);

        await submit();
        updates.set('record-3', { status: 1, score: 100, testCases: [{ id: 1, status: 1 }] });
        await render();
        await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label=Close]')!.click(); });
        assert.equal(quitCount, 1, 'closing an accepted result returns to the statement');

        await submit();
        await act(async () => { findButton('Judging details', document.querySelector('[role=dialog]')!).click(); });
        assert.equal(navigated.length, 1);
        const detail = new URL(navigated[0], window.location.href);
        assert.equal(detail.pathname, '/d/team/record/record-4');
        assert.equal(detail.searchParams.get('submissionSource'), 'editor');
        assert.equal(new URLSearchParams(detail.searchParams.get('problemNav')!).get('tid'), tid);
        assert.equal(quitCount, 1, 'opening details must not run the modal dismissal action');

        // A new page instance models returning from the full detail view. The draft remains intact.
        await render('returned');
        assert.equal(document.querySelector<HTMLTextAreaElement>('[aria-label=Code]')!.value, 'int main() {}');
        await act(async () => { findButton('Run Self Test').click(); });
        assert.equal(JSON.parse(requests.at(-1).body).pretest, true);
        assert.equal(document.querySelector('[role=dialog]'), null, 'self-tests retain the existing input/output flow');
        assert.equal(navigated.length, 1);
        assert.equal(completed.length, 4, 'self-tests do not attach replay records');
        assert.ok(actions.includes('self_test'));
        fail = true;
        await submit();
        assert.equal(document.querySelector('[role=dialog]'), null, 'failed submit requests must not open a fabricated result');
        assert.equal(notices.at(-1).message, 'Denied');

        const cacheKey = `7/team/P42@${tid}`;
        const preservedCode = 'int mySolve() { return 42; }';
        localStorage.setItem(cacheKey, preservedCode);
        localStorage.setItem(`${cacheKey}#lang`, 'cc');
        localStorage.removeItem(`${cacheKey}#defaultLang`);
        user.codeLang = 'py';
        await render('preferred-python');
        assert.equal(localStorage.getItem(`${cacheKey}#lang`), 'py', 'a new preference replaces legacy automatic language caches');
        assert.equal(document.querySelector<HTMLTextAreaElement>('[aria-label=Code]')!.value, preservedCode,
            'changing the preferred language must not overwrite existing code');
        const languageInput = () => document.querySelector<HTMLInputElement>('.hydro-scratchpad-language-select input')!;
        assert.equal(languageInput().value, 'Python');
        await act(async () => { languageInput().click(); });
        await act(async () => {
            [...document.querySelectorAll<HTMLElement>('[role=option]')].find((option) => option.textContent === 'C++')!.click();
        });
        await render('manual-selection');
        assert.equal(languageInput().value, 'C++', 'manual selections persist until the default preference changes again');
        user.codeLang = 'js';
        await render('manual-selection');
        assert.equal(languageInput().value, 'NodeJS', 'a changed default also updates an already mounted editor');
        assert.equal(document.querySelector<HTMLTextAreaElement>('[aria-label=Code]')!.value, preservedCode);
        user.codeLang = 'java';
        await render('disallowed-preference');
        assert.equal(languageInput().value, 'NodeJS', 'a disallowed preference cannot add a language outside the problem allowlist');
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as any)[key];
        }
    }
});

test('submission result uses a fixed, viewport-bounded shell and an independently scrollable case list', () => {
    const css = postcss.parse(readFileSync(new URL('../src/styles/submission-result.css', import.meta.url), 'utf8'));
    const declarations = (selector: string) => {
        const result: Record<string, string> = {};
        css.walkRules(selector, (rule) => rule.walkDecls((decl) => { result[decl.prop] = decl.value; }));
        return result;
    };
    assert.equal(declarations('.hydro-submission-result').height, '560px');
    assert.match(declarations('.hydro-submission-result')['max-height'], /100dvh/);
    assert.equal(declarations('.hydro-submission-result__body')['min-height'], '0');
    assert.equal(declarations('.hydro-submission-result__cases').flex, '1');
    assert.equal(declarations('.hydro-submission-result__cases')['min-height'], '0');
    assert.equal(declarations('.hydro-submission-result__actions')['flex-shrink'], '0');
});
