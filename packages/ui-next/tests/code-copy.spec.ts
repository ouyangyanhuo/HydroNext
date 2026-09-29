import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { attachCodeCopyButtons, copyCodeText } from '../src/components/markdown/code-copy.ts';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const labels = { copy: '复制代码', copied: '代码已复制' };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('icon-only controls copy code, not labels, preserving whitespace and decoded entities', async () => {
    const dom = new JSDOM('<div id="root"><div class="code-block-wrapper"><span>C++</span>'
        + '<pre><code><span>int</span> x = 1;\n  x &lt; 2;\n</code></pre></div></div>');
    const root = dom.window.document.getElementById('root');
    let copied = '';
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (text: string) => { copied = text; } } });
    const cleanup = attachCodeCopyButtons(root, labels, () => assert.fail('unexpected copy failure'));
    try {
        const button = root.querySelector('button');
        assert.equal(button.type, 'button');
        assert.equal(button.textContent, '');
        assert.equal(button.getAttribute('aria-label'), labels.copy);
        assert.ok(button.querySelector('svg'));
        button.click();
        await flush();
        assert.equal(copied, 'int x = 1;\n  x < 2;\n');
        assert.equal(button.getAttribute('aria-label'), labels.copied);
        assert.equal(button.disabled, false);
    } finally {
        cleanup();
        assert.equal(root.querySelector('button'), null);
        assert.ok(root.querySelector('.code-block-wrapper'));
        dom.window.close();
    }
});

test('plain imported and indented pre blocks are wrapped once and restored on cleanup', () => {
    const dom = new JSDOM('<div id="root"><pre>sample\n</pre><pre><code>indented</code></pre></div>');
    const root = dom.window.document.getElementById('root');
    const original = root.innerHTML;
    const cleanup = attachCodeCopyButtons(root, labels, () => {});
    const duplicateCleanup = attachCodeCopyButtons(root, labels, () => {});
    assert.equal(root.querySelectorAll('button').length, 2);
    duplicateCleanup();
    cleanup();
    assert.equal(root.innerHTML, original);
    attachCodeCopyButtons(root, labels, () => {})();
    assert.equal(root.innerHTML, original);
    dom.window.close();
});

test('clipboard rejection reports failure without showing a false success state', async () => {
    const dom = new JSDOM('<div id="root"><pre>code</pre></div>');
    const root = dom.window.document.getElementById('root');
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } });
    let failures = 0;
    const cleanup = attachCodeCopyButtons(root, labels, () => { failures += 1; });
    root.querySelector('button').click();
    await flush();
    assert.equal(failures, 1);
    assert.equal(root.querySelector('button').dataset.copied, 'false');
    assert.equal(root.querySelector('button').disabled, false);
    cleanup();
    dom.window.close();
});

test('HTTP fallback copies exact text and restores focus without leftover fields', async () => {
    const dom = new JSDOM('<button>previous focus</button>');
    const { document } = dom.window;
    const previous = document.querySelector('button');
    previous.focus();
    document.execCommand = (command: string) => {
        assert.equal(command, 'copy');
        assert.equal(document.querySelector('textarea').value, '\tline\n');
        return true;
    };
    await copyCodeText('\tline\n', document);
    assert.equal(document.querySelector('textarea'), null);
    assert.equal(document.activeElement, previous);
    document.execCommand = () => false;
    await assert.rejects(copyCodeText('failure', document), /Copy failed/);
    assert.equal(document.querySelector('textarea'), null);
    dom.window.close();
});

test('unmounting during copying ignores late completion and does not restore removed controls', async () => {
    const dom = new JSDOM('<div id="root"><pre>code</pre></div>');
    const root = dom.window.document.getElementById('root');
    let finish!: () => void;
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: () => new Promise<void>((resolve) => { finish = resolve; }) } });
    const cleanup = attachCodeCopyButtons(root, labels, () => assert.fail('unmounted'));
    root.querySelector('button').click();
    cleanup();
    finish();
    await flush();
    assert.equal(root.querySelector('button'), null);
    assert.equal(root.textContent, 'code');
    dom.window.close();
});
