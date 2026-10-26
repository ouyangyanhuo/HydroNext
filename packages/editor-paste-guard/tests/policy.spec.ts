import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';
import { DEFAULT_PASTE_LIMIT } from '../config.ts';
import { getPasteCharacterCount } from '../ui/limit.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

test('standalone paste policy preserves the limit and exemptions, covers contest editors and removes its listener', () => {
    const dom = new JSDOM('<div class="monaco-editor"><textarea></textarea></div><input id="other">', {
        url: 'https://oj.example/d/exam/p/1',
    });
    let user: any = { perm: '0', priv: 0 };
    const ui: any = {};
    const notices: any[] = [];
    const sdk = {
        PERM: { PERM_EDIT_PROBLEM: 1n, PERM_EDIT_DOMAIN: 2n },
        PRIV: { PRIV_EDIT_SYSTEM: 4, PRIV_UNLIMITED_ACCESS: 8 },
        hasPermValue: (value: string, permission: bigint) => (BigInt(value) & permission) === permission,
        hasPrivValue: (value: number, privilege: number) => (value & privilege) === privilege,
        useSessionStore: { getState: () => ({ user, ui }) },
        useNotificationStore: { getState: () => ({ add: (notice: any) => notices.push(notice) }) },
        translate: (key: string) => key,
    };
    const built = buildSync({ entryPoints: [fileURLToPath(new URL('../ui/policy.ts', import.meta.url))],
        bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
    const module = { exports: {} as any };
    runInNewContext(built.outputFiles[0].text, {
        module, exports: module.exports, window: dom.window, document: dom.window.document, Element: dom.window.Element, console,
        require: (name: string) => { assert.equal(name, '@hydrooj/ui-next'); return sdk; },
    });
    const paste = (text: string, target = dom.window.document.querySelector('textarea')!) => {
        const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
        target.dispatchEvent(event);
        return event.defaultPrevented;
    };
    const dispose = module.exports.setup({});
    try {
        assert.equal(DEFAULT_PASTE_LIMIT, 30, 'Keep the currently configured rule, not an older historical value.');
        assert.equal(getPasteCharacterCount('🙂'.repeat(30)), 30);
        assert.equal(paste('🙂'.repeat(30)), false);
        assert.equal(paste('🙂'.repeat(31)), true);
        assert.equal(notices.length, 1);
        ui.editorPasteLimit = 5;
        assert.equal(paste('12345'), false);
        assert.equal(paste('123456'), true);
        ui.editorPasteLimit = 0;
        assert.equal(paste('x'), true);
        assert.equal(paste(''), true);
        ui.editorPasteLimit = -1;
        assert.equal(paste('x'.repeat(1000)), false);
        delete ui.editorPasteLimit;
        for (const route of ['/p/1', '/d/exam/p/1?tid=contest', '/contest/contest/p/1', '/d/exam/contest/contest/p/1', '/p/1/submit']) {
            dom.reconfigure({ url: `https://oj.example${route}` });
            assert.equal(paste('x'.repeat(31)), true, route);
        }
        for (const exempt of [{ perm: '1', priv: 0 }, { perm: '2', priv: 0 }, { perm: '0', priv: 4 }, { perm: '0', priv: -1 }]) {
            user = exempt;
            assert.equal(paste('x'.repeat(31)), false);
        }
        user = { perm: '0', priv: 0 };
        assert.equal(paste('x'.repeat(31), dom.window.document.querySelector('#other')! as any), false);
        dom.reconfigure({ url: 'https://oj.example/manage/script' });
        assert.equal(paste('x'.repeat(31)), false);
        dom.reconfigure({ url: 'https://oj.example/p/1' });
        dispose();
        assert.equal(paste('x'.repeat(31)), false);
    } finally {
        dispose();
        dom.window.close();
    }
});
