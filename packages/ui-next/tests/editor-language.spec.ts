import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';
import { resolveEditorLanguage, resolveLanguagePreference } from '../src/components/editor/editor-language.ts';

const require = createRequire(import.meta.url);

test('compiler language variants and server-defined Monaco modes resolve to editor languages', () => {
    for (const [compiler, mode] of Object.entries({
        'cc.cc23o2': 'cpp', 'cc.cc26': 'cpp', 'cpp.gcc15': 'cpp', 'c++.clang': 'cpp', 'c.c17': 'c',
        'java.java21': 'java', 'rs.rust2024': 'rust', 'rust.2024': 'rust', 'py.pypy3': 'python', py3: 'python', python3: 'python',
        'python.3': 'python', 'nodejs.22': 'javascript',
        'kt.jvm': 'kotlin', 'js.node22': 'javascript', 'ts.node': 'typescript', 'cs.dotnet': 'csharp', bash: 'shell',
        yaml: 'yaml', json: 'json', '': 'plaintext',
    })) assert.equal(resolveEditorLanguage(compiler, {}), mode);
    assert.equal(resolveEditorLanguage('custom.gcc', { custom: { monaco: 'cpp' } }), 'cpp');
    assert.equal(resolveEditorLanguage('custom.gcc', { 'custom.gcc': { monaco: 'c', highlight: 'cpp' } }), 'c');
    assert.equal(resolveEditorLanguage('custom', { custom: { highlight: 'java astyle-java' } }), 'java');
    assert.equal(resolveEditorLanguage('  CC.CC23  ', {}), 'cpp');
    assert.equal(resolveEditorLanguage('markdown', {}), 'markdown', 'non-programming viewers keep their mode');
    assert.equal(resolveLanguagePreference(['cc.cc17', 'py.py3'], 'cc'), 'cc.cc17');
    assert.equal(resolveLanguagePreference(['cc.cc17', 'py.py3'], 'py.py3'), 'py.py3');
    assert.equal(resolveLanguagePreference(['cc.cc17', 'py.py3'], 'java'), '', 'never select a disallowed language');
});

test('real Monaco preserves highlighting and allows only current-document completion candidates', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const path = fileURLToPath(new URL('../src/components/editor/language-support.ts', import.meta.url));
    const completionsPath = fileURLToPath(new URL('../src/components/editor/document-completions.ts', import.meta.url));
    const built = buildSync({
        stdin: {
            contents: `export * as monaco from 'monaco-editor/editor'; export * from ${JSON.stringify(path)};
            export * from ${JSON.stringify(completionsPath)};
            export { StandaloneServices } from 'monaco-editor/editor/standalone/browser/standaloneServices.js';
            export { ILanguageFeaturesService } from 'monaco-editor/editor/common/services/languageFeatures.js';`,
            resolveDir: process.cwd(), loader: 'ts',
        },
        bundle: true, write: false, format: 'cjs', platform: 'browser', loader: { '.css': 'empty' }, logLevel: 'silent',
    });
    const module = { exports: {} as any };
    const registrations: string[] = [];
    const models: any[] = [];
    try {
        runInNewContext(built.outputFiles[0].text, {
            module, exports: module.exports, require, console, queueMicrotask,
            setTimeout: dom.window.setTimeout.bind(dom.window), clearTimeout: dom.window.clearTimeout.bind(dom.window),
            setInterval: dom.window.setInterval.bind(dom.window), clearInterval: dom.window.clearInterval.bind(dom.window),
            window: dom.window, self: dom.window, document: dom.window.document, navigator: dom.window.navigator,
            HTMLElement: dom.window.HTMLElement, UIEvent: dom.window.UIEvent, MouseEvent: dom.window.MouseEvent,
            customElements: dom.window.customElements,
            CSS: { escape: (value: string) => value },
            requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
            cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
            crypto, performance, TextDecoder, TextEncoder, URL, URLSearchParams,
        });
        const { monaco, ensureEditorLanguage, CODE_MODEL_SCHEME, installDocumentCompletions,
            StandaloneServices, ILanguageFeaturesService } = module.exports;
        const api = { ...monaco, languages: { ...monaco.languages, registerCompletionItemProvider: (id: string, provider: any) => {
            registrations.push(id);
            return monaco.languages.registerCompletionItemProvider(id, provider);
        } } };
        const samples = {
            c: { code: 'int main() { printf("printf"); pritnf(); return 0; } // printf', keyword: 'int', symbol: 'printf', typo: 'pritnf' },
            cpp: { code: 'int main() { sort(a, a + 1); srot(); return 0; } // sort', keyword: 'int', symbol: 'sort', typo: 'srot' },
            java: { code: 'class Main { void run() { println("println"); pritnln(); } } // println',
                keyword: 'class', symbol: 'println', typo: 'pritnln' },
            python: { code: 'if True: print("print"); pritn() # print', keyword: 'if', symbol: 'print', typo: 'pritn' },
            rust: { code: 'fn main() { println!("println"); pritnln!(); } // println', keyword: 'fn', symbol: 'println', typo: 'pritnln' },
            javascript: { code: 'const myArrow = value => value; function main() { readFileSync("readFileSync"); raedFileSync(); } // readFileSync',
                keyword: 'const', symbol: 'readFileSync', typo: 'raedFileSync' },
            typescript: {
                code: 'const myArrow = (value: number) => value; function main() { '
                    + 'readFileSync("readFileSync"); raedFileSync(); } // readFileSync',
                keyword: 'const', symbol: 'readFileSync', typo: 'raedFileSync',
            },
        };
        await Promise.all(Object.entries(samples).map(async ([id, sample]) => {
            // Concurrent mounts and later remounts must not duplicate global registrations.
            await Promise.all([ensureEditorLanguage(api, id), ensureEditorLanguage(api, id)]);
            await ensureEditorLanguage(api, id);
            const tokens = monaco.editor.tokenize(sample.code, id)[0];
            const tokenAt = (offset: number) => [...tokens].reverse().find((token: any) => token.offset <= offset)?.type || '';
            assert.match(tokenAt(sample.code.indexOf(sample.keyword)), /^keyword/, `${id}: keyword`);
            assert.ok(monaco.languages.getLanguages().some((entry: any) => entry.id === id));
            assert.match(tokenAt(sample.code.indexOf(sample.symbol)), /^type\.identifier/, `${id}: known library symbol`);
            assert.doesNotMatch(tokenAt(sample.code.indexOf(sample.typo)), /^type\.identifier/, `${id}: typo is not a known library symbol`);
            assert.match(tokenAt(sample.code.lastIndexOf(sample.symbol)), /^comment/, `${id}: do not color library names inside comments`);
            if (sample.code.includes('"')) assert.match(tokenAt(sample.code.indexOf('"') + 1), /^string/, `${id}: preserve strings`);
            const declared = id === 'python' ? 'def mySolve(value): return mySolve(value)' : id === 'rust'
                ? 'fn mySolve(value: i32) -> i32 { mySolve(value) }' : id === 'javascript' || id === 'typescript'
                    ? 'function mySolve(value) { return mySolve(value); }' : 'int mySolve(int value) { return mySolve(value); }';
            const functionTokens = monaco.editor.tokenize(declared, id)[0];
            for (const offset of [declared.indexOf('mySolve'), declared.lastIndexOf('mySolve')]) {
                const type = [...functionTokens].reverse().find((token: any) => token.offset <= offset)?.type || '';
                assert.match(type, /^variable\.function/, `${id}: custom function declaration/call`);
            }
            if (id === 'javascript' || id === 'typescript') {
                assert.match(tokenAt(sample.code.indexOf('myArrow')), /^variable\.function/, `${id}: arrow function definition`);
                assert.match(monaco.editor.tokenize('if (true) {}', id)[0][0].type, /^keyword/, 'control flow is not a function');
            }
        }));
        assert.deepEqual(registrations, [], 'highlighting must not register built-in word/keyword completion lists');
        await ensureEditorLanguage(api, 'plaintext');
        installDocumentCompletions(monaco);
        installDocumentCompletions(monaco);
        const registry = StandaloneServices.get(ILanguageFeaturesService).completionProvider;
        const nativeProvider = { provideCompletionItems: () => ({ suggestions: [{ label: 'UNWRITTEN_BUILTIN' }] }) };
        const wildcardProvider = { provideCompletionItems: () => ({ suggestions: [{ label: 'OTHER_DOCUMENT' }] }) };
        monaco.languages.registerCompletionItemProvider('javascript', nativeProvider);
        monaco.languages.registerCompletionItemProvider('*', wildcardProvider);
        const other = monaco.editor.createModel('crossDocumentSecret = 1;', 'javascript', monaco.Uri.parse('file:///other.js'));
        models.push(other);
        assert.ok(registry.ordered(other).includes(nativeProvider), 'ordinary non-user-code editors keep their language service');
        await Promise.all(Object.keys(samples).map(async (id) => {
            const model = monaco.editor.createModel('', id, monaco.Uri.parse(`${CODE_MODEL_SCHEME}:///test/${id}`));
            models.push(model);
            if (id === 'typescript') model.isTooLargeForSyncing = () => true;
            const active = registry.ordered(model);
            assert.equal(active.length, 1, `${id}: one exclusive provider suppresses native and wildcard suggestions`);
            assert.ok(!active.includes(nativeProvider) && !active.includes(wildcardProvider));
            const provider = active[0];
            const comment = id === 'python' ? '#' : '//';
            const source = `abcde = 1;\nusedBefore(1);\n"stringOnlyIdentifier";\n${comment} commentOnlyIdentifier\n123456;\n`;
            const suggest = async (prefix: string, body = source) => {
                model.setValue(body + prefix);
                const position = model.getPositionAt(model.getValueLength());
                const result = await provider.provideCompletionItems(model, position, {}, { isCancellationRequested: false });
                return result.suggestions;
            };
            const words = await suggest('abc');
            assert.deepEqual(Array.from(words, (item: any) => item.label), ['abcde']);
            assert.equal(words[0].insertText, 'abcde');
            assert.equal(words[0].kind, monaco.languages.CompletionItemKind.Text);
            assert.equal(words[0].range.startColumn, 1);
            assert.equal(words[0].range.endColumn, 4);
            assert.equal(words[0].additionalTextEdits, undefined);
            assert.equal(words[0].command, undefined);
            const used = await suggest('used');
            assert.deepEqual(Array.from(used, (item: any) => item.label), ['usedBefore'], 'a prior call is sufficient');
            const writtenKeyword = await suggest('whi', id === 'python' ? 'while condition: pass\n' : 'while (condition) {}\n');
            assert.deepEqual(Array.from(writtenKeyword, (item: any) => item.label), ['while'], 'an already written keyword is allowed');
            const definition = id === 'python' ? 'def definedFunction(value): return value\n'
                : id === 'rust' ? 'fn definedFunction(value: i32) -> i32 { value }\n'
                    : id === 'javascript' || id === 'typescript' ? 'function definedFunction(value) { return value; }\n'
                        : 'int definedFunction(int value) { return value; }\n';
            const defined = await suggest('defined', definition);
            assert.deepEqual(Array.from(defined, (item: any) => item.label), ['definedFunction']);
            for (const prefix of ['printf', 'while', 'stringOnly', 'commentOnly', '123', 'crossDocument', '']) {
                // Each query edits this same model, so they must run in order.
                // eslint-disable-next-line no-await-in-loop
                const result = await suggest(prefix);
                assert.equal(result.length, 0, `${id}: do not invent ${prefix || '(empty prefix)'}`);
            }
            assert.equal((await suggest('abc', '')).length, 0, 'deleting the declaration invalidates old cached candidates');
            assert.equal((await suggest('abc', `${comment} abcde\n`)).length, 0, 'a comment is not a code declaration');
            assert.equal((await suggest('abc', '"abcde";\n')).length, 0, 'a string is not a code declaration');
            const multiline = id === 'python' ? '"""\nabcde\n"""\n' : '/*\nabcde\n*/\n';
            assert.equal((await suggest('abc', multiline)).length, 0, 'multiline string/comment state is respected');
            if (id === 'javascript' || id === 'typescript') {
                assert.equal((await suggest('abc', 'const pattern = /abcde/;\n')).length, 0, 'regex literals are not code identifiers');
            }
            assert.equal((await suggest(`${comment} abc`, 'abcde = 1;\n')).length, 0, 'no suggestions inside a comment');
            assert.equal((await suggest('"abc', 'abcde = 1;\n')).length, 0, 'no suggestions inside a string');
            const existingBuiltin = await suggest('prin', 'printf(1);\n');
            assert.deepEqual(Array.from(existingBuiltin, (item: any) => item.label), ['printf'],
                'a library name may be completed only after it appears in code');
        }));
    } finally {
        for (const model of models) model.dispose();
        dom.window.close();
    }
});
