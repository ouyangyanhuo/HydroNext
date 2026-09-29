import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('editor uses updated readOnly, language and value when Monaco finishes loading late', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle,
        localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    }
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const React = require('react');
    const { act, createElement: h } = React;
    const { createRoot } = require('react-dom/client');
    const { MantineProvider } = require('@mantine/core');
    let release!: (value: any) => void;
    const monacoReady = new Promise((resolve) => { release = resolve; });
    const sourcePath = fileURLToPath(new URL('../src/components/editor/code-editor.tsx', import.meta.url));
    const source = readFileSync(sourcePath, 'utf8')
        .replace(/import\.meta\.glob\([^\n]+\)/, '{}')
        .replace(/async function getMonaco\(\) \{[\s\S]*?\n\}\n\ninterface CodeEditorProps/,
            'async function getMonaco() { return globalThis.__loadMonaco(); }\n\ninterface CodeEditorProps');
    const built = buildSync({
        stdin: { contents: source, sourcefile: sourcePath, loader: 'tsx', resolveDir: process.cwd() },
        bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
    });
    const module = { exports: {} as any };
    runInNewContext(built.outputFiles[0].text, {
        module, exports: module.exports, require, document, localStorage, __loadMonaco: () => monacoReady,
    });
    const root = createRoot(document.getElementById('root'));
    const model = { language: '' };
    const options: any = {};
    const editor = {
        value: '', getValue() { return this.value; }, setValue(value: string) { this.value = value; },
        updateOptions(next: any) { Object.assign(options, next); }, getModel: () => model, dispose() {},
    };
    const render = (props: any) => root.render(h(MantineProvider, {}, h(module.exports.CodeEditor, props)));
    try {
        await act(async () => render({ value: '', language: 'c', readOnly: true }));
        await act(async () => render({ value: 'int main() {}', language: 'cc', readOnly: false, fontSize: 16 }));
        await act(async () => release({ editor: {
            create: (_element: any, initial: any) => {
                Object.assign(options, initial);
                editor.value = initial.value;
                return editor;
            },
            setTheme() {}, setModelLanguage: (_model: any, language: string) => { model.language = language; },
        } }));
        assert.equal(options.readOnly, false);
        assert.equal(options.fontSize, 16);
        assert.equal(editor.getValue(), 'int main() {}');
        assert.equal(model.language, 'cpp');
        // Deliberately read-only source viewers must continue to honor their prop.
        await act(async () => render({ value: 'locked', language: 'c', readOnly: true }));
        assert.equal(options.readOnly, true);
        await act(async () => render({ value: 'editable', language: 'c', readOnly: false }));
        assert.equal(options.readOnly, false);
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as any)[key];
        }
    }
});
