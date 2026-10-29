import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

function helper(page: string, names: string[], globals: Record<string, any> = {}) {
    const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(page, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const snippets = ast.statements.filter((node) => (
        ts.isFunctionDeclaration(node) && names.includes(node.name?.text || '')
    ) || (
        ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => names.includes(declaration.name.getText(ast)))
    )).map((node) => node.getText(ast));
    assert.equal(snippets.length, names.length);
    const code = transformSync(`${snippets.join('\n')}\nmodule.exports = { ${names.join(', ')} };`, { loader: 'ts', format: 'cjs' }).code;
    const module = { exports: {} as any };
    runInNewContext(code, { module, exports: module.exports, ...globals });
    return module.exports;
}

test('statement language aliases retain their original keys, labels and order', () => {
    const { langLabel } = helper('problem_detail', ['langLabel']);
    assert.equal(langLabel('zh_CN'), '简体中文');
    assert.equal(langLabel('zh_TW'), '繁體中文');
    assert.equal(langLabel('other'), 'other');
    const { normalizeStatementLangs } = helper('problem_edit', ['FALLBACK_STATEMENT_LANGS', 'normalizeStatementLangs']);
    assert.equal(JSON.stringify(normalizeStatementLangs(null)), JSON.stringify([
        ['zh', '简体中文'], ['zh_TW', '繁體中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'],
    ]));
});

test('editing preserves multiple statements, languages, attached files and whitespace-only content', () => {
    const { initialStatements, normalizeContent, serializeStatements } = helper('problem_edit',
        ['normalizeContent', 'initialStatements', 'serializeStatements']);
    assert.ok(normalizeContent);
    const original = [
        { name: 'statement.md', lang: 'en', content: '# Statement' },
        { name: 'notes.md', lang: 'en', content: '  ' },
        { name: 'statement.pdf', lang: 'zh', file: '题面.pdf' },
    ];
    const entries = initialStatements(JSON.stringify(original), '', 'en');
    assert.deepEqual(JSON.parse(serializeStatements(entries)), original);
    entries[0].content = '# Updated';
    const saved = JSON.parse(serializeStatements(entries));
    assert.equal(saved[0].content, '# Updated');
    assert.deepEqual(saved.slice(1), original.slice(1));
    const legacy = initialStatements(undefined, JSON.stringify({ zh: '旧题面', en: 'Statement' }), 'zh');
    assert.deepEqual(JSON.parse(serializeStatements(legacy)), [
        { name: 'zh.md', lang: 'zh', content: '旧题面' },
        { name: 'en.md', lang: 'en', content: 'Statement' },
    ]);
});

test('printing uses text nodes, preserving code, names and filenames without interpreting user HTML', () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
    const callbacks: Array<() => void> = [];
    let printed = false;
    let popup: any;
    const { printPlainTask } = helper('contest_print', ['printPlainTask'], {
        window: {
            open: (...args: any[]) => {
                popup = args;
                return { document: dom.window.document, print: () => { printed = true; } };
            },
        },
        formatUserName: () => 'Display <img src=x> (user)',
        setTimeout: (callback: () => void, delay: number) => { assert.equal(delay, 300); callbacks.push(callback); },
    });
    try {
        const content = '#include <iostream>\n<script>alert(1)</script>\na & b';
        printPlainTask({ title: '<img onerror=alert(1)>.cpp', content }, { school: '<svg onload=alert(1)>' });
        const document = dom.window.document;
        assert.equal(popup[1], '_blank');
        assert.equal(document.title, '<img onerror=alert(1)>.cpp');
        assert.equal(document.querySelector('pre')?.textContent, content);
        assert.equal(document.querySelectorAll('img, svg, script').length, 0);
        assert.ok(document.querySelector('.header')?.textContent?.includes('Display <img src=x> (user)'));
        assert.equal(document.querySelectorAll('.header br').length, 1);
        callbacks[0]();
        assert.equal(printed, true);
    } finally { dom.window.close(); }
});

test('printing retains the 300 display-line limit and handles a blocked popup', () => {
    const dom = new JSDOM('<html><head></head><body></body></html>');
    const { printPlainTask } = helper('contest_print', ['printPlainTask'], {
        window: { open: () => ({ document: dom.window.document, print() {} }) },
        formatUserName: () => 'user', setTimeout() {},
    });
    try {
        printPlainTask({ title: 'long.cpp', owner: 2, content: Array.from({ length: 301 }, () => 'x'.repeat(101)).join('\n') }, null);
        assert.equal(dom.window.document.querySelector('pre')?.textContent?.split('\n').length, 150);
        assert.ok(dom.window.document.querySelector('.header')?.textContent?.startsWith('[2]'));
        const blocked = helper('contest_print', ['printPlainTask'], { window: { open: () => null } });
        assert.doesNotThrow(() => blocked.printPlainTask({ title: 'blocked' }, null));
    } finally { dom.window.close(); }
});
