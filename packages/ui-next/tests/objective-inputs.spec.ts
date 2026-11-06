import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from 'js-yaml';
import MarkdownIt from 'markdown-it';
import { test } from 'node:test';
import { markdownXssPlugin } from '../src/components/markdown/markdown-xss.ts';
import { attachObjectiveInputs } from '../src/components/markdown/objective-inputs.ts';
import {
    hasObjectiveAnswer, normalizeObjectiveAnswers, objectiveCaseId, objectiveDraftKey, readObjectiveDraft,
} from '../src/utils/objective-answers.ts';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const markdown = new MarkdownIt({ html: true }).use(markdownXssPlugin);
const statement = [
    'Fill {{ input(1) }} and explain {{ textarea(2-1) }}.',
    '', '{{ select(3) }}', '', '- **one**', '- two',
    '', '{{ multiselect(4) }}', '', '- first', '- second', '- third',
    '', '{{ dropdown(5)[red, green, blue] }}',
].join('\n');

test('all five legacy markers become accessible controls and collect the judge answer format', () => {
    const dom = new JSDOM(`<main>${markdown.render(statement)}</main>`);
    const root = dom.window.document.querySelector('main');
    const answers: Record<string, any> = {};
    const mounted = attachObjectiveInputs(root, { prefix: 'test', onChange: (id, value) => { answers[id] = value; } });
    try {
        assert.deepEqual(mounted.questions.map((item) => item.id), ['1', '2-1', '3', '4', '5']);
        assert.equal(root.querySelectorAll('input, textarea, select').length, 8);
        assert.equal(root.querySelector('label strong').textContent, 'one');
        assert.doesNotMatch(root.textContent, /\{\{ (?:input|textarea|select|multiselect|dropdown)/);
        const input = root.querySelector('input[type=text]');
        input.value = '0';
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        const textarea = root.querySelector('textarea');
        textarea.value = 'line one\nline two';
        textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        root.querySelectorAll('input[type=radio]')[1].click();
        const choices = root.querySelectorAll('input[type=checkbox]');
        choices[2].click();
        choices[0].click();
        choices[2].click();
        const dropdown = root.querySelector('select');
        dropdown.value = 'green';
        dropdown.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        assert.deepEqual(answers, { 1: '0', '2-1': 'line one\nline two', 3: 'B', 4: ['A'], 5: 'green' });
        assert.equal(input.getAttribute('aria-label'), '#1');
        mounted.update({ 1: 'restored', 3: 'A', 4: ['B', 'C'], 5: 'blue' }, true);
        assert.equal(input.value, 'restored');
        assert.ok([...root.querySelectorAll('input, textarea, select')].every((control: any) => control.disabled));
        assert.deepEqual([...choices].map((control: any) => control.checked), [false, true, true]);
        assert.equal(dropdown.value, 'blue');
        assert.equal(textarea.value, '');
        mounted.update({}, false);
        assert.ok([...root.querySelectorAll('input')].every((control: any) => !control.checked && !control.value.includes('restored')));
    } finally { mounted.destroy(); dom.window.close(); }
});

test('ordinary code is preserved, explicit #input fences work, and effect cleanup supports remounting', () => {
    const dom = new JSDOM(`<main>${markdown.render([
        '`{{ input(90) }}`', '', '```cpp', '{{ input(91) }}', '```',
        '', '```#input', 'int value = {{ input(6) }};', '```', '', '{{ input(7) }}',
    ].join('\n'))}</main>`);
    const root = dom.window.document.querySelector('main');
    const original = root.innerHTML;
    try {
        for (let index = 0; index < 2; index++) {
            const mounted = attachObjectiveInputs(root, { prefix: 'test', onChange() {} });
            assert.deepEqual(mounted.questions.map((item) => item.id), ['6', '7']);
            assert.equal(root.querySelectorAll('input').length, 2);
            mounted.destroy();
            assert.equal(root.innerHTML, original);
        }
    } finally { dom.window.close(); }
});

test('missing option lists remain visible, option markup is sanitized, and separate sections have independent radio names', () => {
    const source = '{{ select(1) }}\n\nNo options.\n\n{{ select(2) }}\n\n- <img src=x onerror="alert(1)"> **safe**\n- other';
    const dom = new JSDOM(`<main>${markdown.render(source)}</main><aside>${markdown.render(source)}</aside>`);
    const roots = ['main', 'aside'].map((selector) => dom.window.document.querySelector(selector));
    const original = roots[0].innerHTML;
    const mounted = roots.map((root, index) => attachObjectiveInputs(root, { prefix: `section${index}`, onChange() {} }));
    try {
        assert.equal(mounted[0].questions.length, 1);
        assert.match(roots[0].textContent, /\{\{ select\(1\) \}\}/);
        assert.equal(roots[0].querySelector('img').getAttribute('onerror'), null);
        assert.equal(roots[0].querySelector('label strong').textContent, 'safe');
        const [a, b] = roots.map((root) => root.querySelector('input'));
        a.click();
        b.click();
        assert.ok(a.checked && b.checked);
        mounted[0].destroy();
        assert.equal(roots[0].innerHTML, original);
    } finally { mounted[1].destroy(); dom.window.close(); }
});

test('drafts isolate identities and contests, reject corrupted values, and preserve string answers through YAML', () => {
    const key = objectiveDraftKey(1, 'domain', 42, 'contest');
    assert.notEqual(key, objectiveDraftKey(2, 'domain', 42, 'contest'));
    assert.notEqual(key, objectiveDraftKey(1, 'other', 42, 'contest'));
    assert.notEqual(key, objectiveDraftKey(1, 'domain', 43, 'contest'));
    assert.notEqual(key, objectiveDraftKey(1, 'domain', 42));
    assert.notEqual(key, objectiveDraftKey(1, 'domain', 42, 'other'));
    assert.deepEqual(readObjectiveDraft({ getItem() { throw new Error('blocked'); } }, key), {});
    for (const raw of ['bad json', 'null', '[]', '{"version":2,"answers":{"1":"A"}}']) {
        assert.deepEqual(readObjectiveDraft({ getItem: () => raw }, key), {});
    }
    const draft = JSON.stringify({ version: 1, answers: { 1: '001', '2-1': ['C', 'A', 'A'], invalid: 'x', 3: { bad: true }, 4: 0 } });
    assert.deepEqual(readObjectiveDraft({ getItem: () => draft }, key), { 1: '001', '2-1': ['A', 'C'] });
    assert.deepEqual(normalizeObjectiveAnswers(load('1: "001"\n2-1: [A, C]\n')), { 1: '001', '2-1': ['A', 'C'] });
    assert.equal(hasObjectiveAnswer('0'), true);
    assert.equal(hasObjectiveAnswer('  '), false);
    assert.equal(hasObjectiveAnswer([]), false);
    assert.equal(objectiveCaseId({ subtaskId: 3 }), '3');
    assert.equal(objectiveCaseId({ subtaskId: 3, id: 2 }), '3-2');
});
