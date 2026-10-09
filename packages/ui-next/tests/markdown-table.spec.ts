import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import MarkdownIt from 'markdown-it';
import { test } from 'node:test';
import { markdownXssPlugin } from '../src/components/markdown/markdown-xss.ts';
import { tableCompatibilityPlugin } from '../src/components/markdown/table-compat.ts';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const md = new MarkdownIt({ html: true }).use(tableCompatibilityPlugin).use(markdownXssPlugin);
const original = new MarkdownIt({ html: true }).use(markdownXssPlugin);
const sample = [
    '| 秒数 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |',
    '| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
    '| **红队** | 无 | **欢呼** | 无 | **欢呼** | 无 | **欢呼** | 无 | **欢呼** | 无 | **欢呼** |',
    '| **蓝队** | 无 | 无 | **欢呼** | 无 | 无 | **欢呼** | 无 | 无 | **欢呼** | 无 |',
    '| **是否有助威声** | 否 | **是** | **是** | **是** | 否 | **是** | 否 | **是** | **是** | **是** |',
].join('\n');

test('problem statement table tolerates surplus alignment markers without losing cells', () => {
    assert.doesNotMatch(original.render(sample), /<table>/);
    const dom = new JSDOM(md.render(sample));
    try {
        const { document } = dom.window;
        assert.equal(document.querySelectorAll('table').length, 1);
        assert.equal(document.querySelectorAll('th').length, 11);
        const rows = [...document.querySelectorAll('tbody tr')];
        assert.equal(rows.length, 3);
        for (const row of rows) assert.equal(row.children.length, 11);
        assert.equal(rows[0].lastElementChild.textContent, '欢呼');
        assert.equal(rows[2].firstElementChild.querySelector('strong').textContent, '是否有助威声');
        for (const cell of document.querySelectorAll('th, td')) assert.equal(cell.style.textAlign, 'center');
    } finally {
        dom.window.close();
    }
});

test('valid tables retain native alignment, escaped pipes and missing-cell behavior', () => {
    const tables = [
        '| A | B | C |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |',
        'A \\| B | C\n--- | ---\nx \\| y | z',
        '| A | B |\n| --- | --- |\n| 1 |',
    ];
    for (const text of tables) assert.equal(md.render(text), original.render(text));
});

test('surplus-marker repair correctly counts escaped pipes and preserves alignment', () => {
    const text = 'A \\| B | C\n:--- | ---: | ---\nx \\| y | z';
    assert.equal(md.render(text), original.render(text.replace(':--- | ---: | ---', ':--- | ---:')));
});

test('ambiguous or invalid tables are not repaired by dropping meaningful columns', () => {
    const tables = [
        '| A | B |\n| --- | --- | --- |\n| 1 | 2 | 3 |',
        '| A | B |\n| --- | --- | --- |\n| 1 | 2 |\n| 3 | 4 | 5 |',
        '| A | B |\n| --- |',
        '| A | B |\n| --- | --- | --- |',
        '| A | B |\n| --- || --- |\n| 1 | 2 |',
        '| A | B |\n- --- | --- | ---\n| 1 | 2 |',
    ];
    for (const text of tables) assert.equal(md.render(text), original.render(text));
});

test('fenced and indented code and raw HTML are unchanged', () => {
    const examples = [
        `\`\`\`markdown\n${sample}\n\`\`\``,
        sample.split('\n').map((line) => `    ${line}`).join('\n'),
        `<div>\n${sample}\n</div>`,
    ];
    for (const text of examples) assert.equal(md.render(text), original.render(text));
});

test('nested tables and following blocks keep their original content and source positions', () => {
    const valid = sample.replace('| :---: | :---: |\n', '| :---: |\n');
    const wrap = (text: string) => `Before\n\n> ${text.split('\n').join('\n> ')}\n\nAfter\n\n${text}\n\nEnd`;
    assert.equal(md.render(wrap(sample)), original.render(wrap(valid)));
    const list = (text: string) => `- Table:\n\n${text.split('\n').map((line) => `  ${line}`).join('\n')}\n\n- Next item`;
    assert.equal(md.render(list(sample)), original.render(list(valid)));
    const tokens = md.parse(wrap(sample), {});
    assert.deepEqual(tokens.filter((token) => token.type === 'table_open').map((token) => token.map), [[2, 7], [10, 15]]);
});

test('repair does not bypass HTML sanitization inside table cells', () => {
    const text = '| A | B |\n| --- | --- | --- |\n| <img src="x" onerror="alert(1)"> | <script>alert(2)</script> |';
    const html = md.render(text);
    assert.match(html, /<table>/);
    assert.doesNotMatch(html, /onerror|<script>/);
});

test('disabled table parsing remains disabled', () => {
    const disabled = new MarkdownIt().disable('table').use(tableCompatibilityPlugin);
    assert.doesNotMatch(disabled.render(sample), /<table>/);
});
