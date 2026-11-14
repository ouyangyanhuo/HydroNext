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
import * as statuses from '../src/components/record/status-map.ts';
import { extractLocalizedContent } from '../src/utils/i18n-content.ts';
import * as drafts from '../src/utils/objective-answers.ts';
import { getSubmissionRecordQuery } from '../src/utils/problem-navigation.ts';
import { formatUserName } from '../src/utils/user-name.ts';

const require = createRequire(import.meta.url);

test('objective form restores drafts, retains answers across language changes, signs submissions, handles failures and clears answers', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<div id="root"></div><aside id="sidebar"></aside>', {
        url: 'http://localhost/d/test/p/P42?tid=0123456789abcdef01234567', pretendToBeVisual: true,
    });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, getComputedStyle: dom.window.getComputedStyle,
        Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot, Document: dom.window.Document,
        ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
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
    dom.window.localStorage.setItem(draftKey, JSON.stringify({ version: 1, answers: { 1: '001', 2: ['B'], 3: 'C' } }));
    const navigations: string[] = [];
    const signed: any[] = [];
    const requests: any[] = [];
    const updates = new Map<string, any>();
    let successCount = 0;
    let failure = true;
    let policy: any;
    let serverPolicy: any;
    let lostResponse = false;
    const statusReads: any[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const buildUrl = (name: string, params: any, query: any) => `/${name}/${params.rid || params.tid}?${new URLSearchParams(query)}`;
    const mocks: Record<string, any> = {
        'js-yaml': { load, dump: (value: any, options: any) => require('js-yaml').dump(JSON.parse(JSON.stringify(value)), options) },
        '@/components/common/button': require('@mantine/core'),
        '@/context/page-data': {
            usePageData: () => ({ args: { tdoc: { docId: tid, proctorEnabled: true }, objectiveSubmission: policy } }),
            useUiContext: () => ({ domainId: 'test' }), useUserContext: () => ({ _id: 7 }),
        },
        '@/context/router': { useNavigate: () => (url: string) => navigations.push(url) },
        '@/hooks/use-build-url': { useBuildUrl: () => buildUrl },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/hooks/use-record-socket': { useRecordSocket: (rid?: string) => updates.get(rid || '') || null },
        '@/stores/session': { useSessionStore: (selector: any) => selector({ language: 'en', ui: { domainId: 'test' } }) },
        '@/registry/request-security': {
            protectedAccessHeaders: async () => ({ 'x-proctor-proof': 'read-proof' }),
            protectedSubmissionHeaders: async (...args: any[]) => { signed.push(args); return { 'x-proctor-proof': 'proof' }; },
        },
        '@/utils/objective-answers': drafts,
        '@/components/record/status-map': statuses,
        './status-map': statuses,
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
                if (options.method !== 'POST') {
                    statusReads.push({ url, ...options });
                    return { ok: true, json: async () => ({ objectiveSubmission: serverPolicy }) };
                }
                requests.push({ url, ...options });
                await pending;
                if (lostResponse) throw new Error('Network error');
                return {
                    ok: !failure,
                    json: async () => failure ? { error: { message: 'Try again' } } : { rid: `record-id-${++successCount}` },
                };
            },
        });
        return module.exports;
    };
    mocks['@/components/common/confirm-dialog'] = loadComponent('../src/components/common/confirm-dialog.tsx');
    mocks['@/components/markdown/markdown-renderer'] = loadComponent('../src/components/markdown/markdown-renderer.tsx');
    mocks['./record-status-badge'] = loadComponent('../src/components/record/record-status-badge.tsx');
    mocks['@/components/record/submission-result-modal'] = loadComponent('../src/components/record/submission-result-modal.tsx');
    const { ObjectiveAnswerForm, ObjectiveMarkdown } = loadComponent('../src/components/problem/objective-answer-form.tsx');
    const root = createRoot(document.getElementById('root'));
    let sidebarTarget: HTMLElement | null = null;
    const content = '{{ input(1) }}\n\n{{ multiselect(2) }}\n\n- A\n- **B**\n\n{{ select(3) }}\n- A\n- B\n- C\n- D';
    const render = (disabled = false, language = 'en', formKey = 'first') => root.render(h(MantineProvider, { env: 'test' },
        h(React.StrictMode, {}, h(ObjectiveAnswerForm, {
            key: formKey, pid: 42, tid, submitUrl: `/d/test/p/P42/submit?tid=${tid}`, disabled, disabledReason: 'Contest Closed', sidebarTarget,
        }, h(ObjectiveMarkdown, { content: language === 'en' ? content : `Translated\n\n${content}`, language })))));
    const dispatchSubmit = () => document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    try {
        await act(async () => render());
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '001');
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].checked);
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[2].checked);
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[2].defaultChecked);
        assert.match(document.body.textContent!, /Answered: 3\/3/);
        const sidebar = document.getElementById('sidebar')!;
        sidebarTarget = sidebar;
        await act(async () => render());
        assert.match(sidebar.textContent!, /Answered: 3\/3/);
        assert.equal(sidebar.querySelectorAll('nav button').length, 3);
        assert.equal(document.querySelector('form')!.querySelector('nav'), null, 'the answer card moves out of the statement');
        assert.equal(document.querySelectorAll('button[type=submit]').length, 1, 'there is one submission action');
        const submit = sidebar.querySelector<HTMLButtonElement>('button[type=submit]')!;
        const clear = [...sidebar.querySelectorAll('button')].find((button) => button.textContent === 'Clear answers')!;
        assert.equal(clear.parentElement, submit.parentElement, 'the answer actions share one row');
        assert.ok(clear.compareDocumentPosition(submit) & 4, 'clear answers is left of submit');
        assert.equal(submit.form, document.querySelector('form'), 'the sidebar submit button still owns the answer form');
        await act(async () => {
            // Native restoration can overwrite checked properties without emitting input/change.
            document.querySelectorAll<HTMLInputElement>('input[type=radio]')[2].checked = false;
            dom.window.dispatchEvent(new dom.window.Event('pageshow'));
        });
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[2].checked);
        await act(async () => {
            const input = document.querySelector<HTMLInputElement>('input[type=text]')!;
            input.value = '0';
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        assert.equal(drafts.readObjectiveDraft(dom.window.localStorage, draftKey)['1'], '0');
        await act(async () => render(false, 'zh'));
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '0');
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1].checked);
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[2].checked);
        await act(async () => { document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click(); });
        assert.equal(drafts.readObjectiveDraft(dom.window.localStorage, draftKey)['3'], 'B');
        await act(async () => render(true));
        assert.ok(document.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled);
        assert.ok([...document.querySelectorAll<HTMLInputElement>('input')].every((input) => input.disabled));
        await act(async () => { dispatchSubmit(); });
        assert.equal(requests.length, 0);
        await act(async () => render());
        await act(async () => {
            sidebar.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
            dispatchSubmit();
        });
        assert.equal(requests.length, 1, 'a pending submission cannot be sent twice');
        assert.equal(signed[0][0], true);
        assert.equal(signed[0][1], requests[0].url);
        const body = JSON.parse(requests[0].body);
        assert.equal(body.lang, '_');
        assert.deepEqual(load(body.code), { 1: '0', 2: ['B'], 3: 'B' });
        assert.equal(signed[0][2].code, body.code);
        assert.equal(signed[0][2].pid, 42);
        assert.equal(requests[0].headers['x-proctor-proof'], 'proof');
        await act(async () => release());
        assert.match(document.querySelector('[role=alert]')!.textContent!, /Try again/);
        assert.equal(document.querySelector('[role=dialog]'), null, 'failed requests must not open a result dialog');
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '0');
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].checked);
        failure = false;
        await act(async () => { dispatchSubmit(); });
        assert.equal(navigations.length, 0, 'objective submissions now stay on the answer page');
        assert.match(document.querySelector('[role=dialog]')!.textContent!, /Waiting/);
        updates.set('record-id-1', {
            status: 2, score: 25, time: 99, memory: 88, code: 'SECRET_ANSWERS', lang: 'SECRET_LANGUAGE',
            testCases: [{ subtaskId: 1, status: 1 }, { subtaskId: 2, id: 3, status: 2 }],
        });
        await act(async () => render());
        const firstDialog = document.querySelector('[role=dialog]')!;
        assert.match(firstDialog.textContent!, /Wrong Answer/);
        assert.match(firstDialog.textContent!, /Score25/);
        const labels = [...firstDialog.querySelectorAll('li')].map((item) => item.textContent);
        assert.deepEqual(labels, ['#1Accepted', '#2-3Wrong Answer'], 'use objective question IDs, including grouped questions');
        assert.doesNotMatch(firstDialog.textContent!, /SECRET|Total Time|Peak Time|Peak Memory|Language|99ms/);
        assert.ok(firstDialog.querySelector('.mantine-ScrollArea-viewport'));
        await act(async () => { firstDialog.querySelector<HTMLButtonElement>('[aria-label=Close]')!.click(); });
        assert.equal(document.querySelector('[role=dialog]'), null);
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '0');
        assert.ok(!document.querySelector<HTMLInputElement>('input[type=text]')!.disabled, 'failed answers remain editable');

        await act(async () => { dispatchSubmit(); });
        assert.match(document.querySelector('[role=dialog]')!.textContent!, /Waiting/);
        assert.equal(document.querySelector('[role=dialog]')!.querySelectorAll('li').length, 0, 'new submissions cannot reuse old cases');
        await act(async () => {
            document.querySelector('[role=dialog]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        updates.set('record-id-2', { status: 1, score: 100 });
        await act(async () => render());
        assert.equal(document.querySelector('[role=dialog]'), null, 'late results must not reopen the dialog');
        assert.equal(navigations.length, 0);

        await act(async () => { dispatchSubmit(); });
        updates.set('record-id-3', { status: 1, score: 100, testCases: [{ subtaskId: 1, status: 1 }] });
        await act(async () => render());
        assert.match(document.querySelector('[role=dialog]')!.textContent!, /Accepted/);
        await act(async () => { document.querySelector<HTMLButtonElement>('[role=dialog] [aria-label=Close]')!.click(); });
        assert.equal(document.querySelector('[role=dialog]'), null);
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '0', 'accepted answers are not cleared on dismissal');
        assert.equal(navigations.length, 0, 'the objective statement is already the answer page');

        await act(async () => { dispatchSubmit(); });
        await act(async () => {
            [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')]
                .find((button) => button.textContent === 'Judging details')!.click();
        });
        assert.equal(navigations.length, 1);
        assert.match(navigations[0], /record_detail\/record-id-4\?problemNav=/);
        const detailQuery = new URL(navigations[0], window.location.href).searchParams;
        assert.equal(new URLSearchParams(detailQuery.get('problemNav')!).get('tid'), tid);
        assert.equal(detailQuery.has('submissionSource'), false, 'returning must not open the code editor for objective answers');
        await act(async () => render(false, 'en', 'remounted'));
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '0');
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].checked, 'a full remount restores the saved single choice');
        await act(async () => { [...document.querySelectorAll('button')].find((button) => button.textContent === 'Clear answers')!.click(); });
        await act(async () => { [...document.querySelectorAll('button')].find((button) => button.textContent === 'Confirm')!.click(); });
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, '');
        assert.ok([...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].every((input) => !input.checked));
        assert.ok([...document.querySelectorAll<HTMLInputElement>('input[type=radio]')].every((input) => !input.checked));
        assert.deepEqual(drafts.readObjectiveDraft(dom.window.localStorage, draftKey), {});
        assert.match(sidebar.textContent!, /Answered: 0\/3/);
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

        // A restricted contest asks before submitting a whole answer sheet, including unanswered questions.
        policy = { once: true, submitted: false };
        dom.window.localStorage.removeItem(draftKey);
        await act(async () => render(false, 'en', 'once'));
        const beforeOnce = requests.length;
        await act(async () => dispatchSubmit());
        assert.equal(requests.length, beforeOnce, 'opening confirmation must not consume the submission');
        assert.match(document.querySelector('[role=dialog]')!.textContent!, /Unanswered questions: 1, 2, 3/);
        assert.match(document.querySelector('[role=dialog]')!.textContent!, /zero points.*only be submitted once/);
        const clickDialog = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')]
            .find((button) => button.textContent === label)!.click();
        await act(async () => clickDialog('Return to answers'));
        assert.equal(requests.length, beforeOnce);
        assert.ok(!document.querySelector<HTMLInputElement>('input[type=text]')!.disabled);
        failure = true;
        await act(async () => dispatchSubmit());
        await act(async () => clickDialog('Confirm submission'));
        assert.equal(requests.length, beforeOnce + 1);
        assert.ok(!document.querySelector<HTMLInputElement>('input[type=text]')!.disabled, 'a rejected submission keeps the sheet editable');
        assert.equal(statusReads.length, 1);
        assert.equal(statusReads[0].headers['x-proctor-proof'], 'read-proof', 'recovery reads retain contest authentication');
        failure = false;
        await act(async () => dispatchSubmit());
        await act(async () => clickDialog('Confirm submission'));
        assert.equal(requests.length, beforeOnce + 2);
        assert.ok(document.querySelector<HTMLInputElement>('input[type=text]')!.disabled);
        assert.ok(sidebar.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled);
        await act(async () => dispatchSubmit());
        assert.equal(requests.length, beforeOnce + 2, 'a successful submission locks direct form events too');

        // Refresh restores the server's actual answers rather than an unsent local draft.
        policy = { once: true, submitted: true, answers: '1: server-answer\n2: [A]\n3: D\n' };
        await act(async () => render(false, 'en', 'once-refreshed'));
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, 'server-answer');
        assert.ok(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[3].checked);
        assert.ok(document.querySelector<HTMLInputElement>('input[type=text]')!.disabled);
        assert.match(sidebar.textContent!, /Already submitted/);

        // The record may have committed even when its HTTP response was lost.
        policy = { once: true, submitted: false };
        serverPolicy = { once: true, submitted: true, answers: '1: committed-answer\n' };
        lostResponse = true;
        await act(async () => render(false, 'en', 'once-response-lost'));
        await act(async () => dispatchSubmit());
        await act(async () => clickDialog('Confirm submission'));
        assert.equal(document.querySelector<HTMLInputElement>('input[type=text]')!.value, 'committed-answer');
        assert.ok(document.querySelector<HTMLInputElement>('input[type=text]')!.disabled);
        assert.equal(document.querySelector('[role=alert]'), null, 'successful recovery replaces a transport error with submitted status');
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as any)[key];
        }
    }
});

test('objective options CSS renders options two per row via grid layout', () => {
    const css = readFileSync(new URL('../src/components/problem/objective.css', import.meta.url), 'utf8');
    assert.match(css, /\.hydro-markdown ul\.hydro-objective-options\s*\{[^}]*display:\s*grid/);
    assert.match(css, /\.hydro-markdown ul\.hydro-objective-options\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});
