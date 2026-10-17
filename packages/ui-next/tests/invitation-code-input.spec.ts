import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { INVITATION_CODE_LENGTH, isInvitationCodeComplete } from '../src/utils/invitation-code';

const require = createRequire(import.meta.url);

test('invitation code slots preserve positions, advance focus, handle paste, and block incomplete submission', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
        requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const { act, createElement: h, useState } = require('react');
    const { createRoot } = require('react-dom/client');
    const mantine = require('@mantine/core');
    const module = { exports: {} as any };
    const mocks: Record<string, any> = {
        './invitation-code-input.css': {},
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string, count: number) => key.replace('{0}', String(count)) }) },
        '@/utils/invitation-code': { INVITATION_CODE_LENGTH, isInvitationCodeComplete },
    };
    runInNewContext(transformSync(readFileSync(new URL('../src/components/common/invitation-code-input.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code, { module, exports: module.exports, require: (name: string) => mocks[name] ?? require(name) });
    let currentValue = '';
    let submissions = 0;
    function Fixture() {
        const [value, setValue] = useState('');
        currentValue = value;
        return h(mantine.MantineProvider, null, h(module.exports.InvitationCodeInput, {
            label: 'Invitation Code', value, onChange: setValue, onSubmit: () => submissions++, required: true,
        }));
    }
    const root = createRoot(document.getElementById('root'));
    try {
        await act(async () => root.render(h(Fixture)));
        const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="text"]')];
        assert.equal(inputs.length, 8);
        const key = async (index: number, value: string) => act(async () => {
            inputs[index].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
        });
        const enter = async (index: number, value: string) => act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(inputs[index], value);
            inputs[index].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        const paste = async (index: number, value: string) => act(async () => {
            const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'clipboardData', { value: { getData: () => value } });
            inputs[index].dispatchEvent(event);
        });
        await key(0, 'Enter');
        assert.equal(submissions, 0);
        for (let index = 0; index < 8; index++) {
            // Each keystroke must render before checking focus on the next slot.
            // eslint-disable-next-line no-await-in-loop
            await enter(index, 'abc23456'[index]);
            assert.equal(document.activeElement, inputs[Math.min(index + 1, 7)]);
        }
        assert.equal(currentValue, 'ABC23456');
        assert.ok(isInvitationCodeComplete(currentValue));
        await key(2, 'Delete');
        assert.equal(currentValue, 'AB 23456');
        assert.equal(inputs[3].value, '2');
        assert.equal(isInvitationCodeComplete(currentValue), false);
        await key(2, 'Enter');
        assert.equal(submissions, 0);
        await enter(2, 'c');
        await key(3, 'Enter');
        assert.equal(submissions, 1);
        await key(0, 'Delete');
        assert.equal(currentValue, ' BC23456', 'leading empty positions are preserved');
        await paste(5, 'abcd2345');
        assert.equal(currentValue, 'ABCD2345', 'a complete pasted code replaces all slots');
        await paste(0, 'ABCD23456');
        assert.equal(currentValue, '', 'overlong paste is rejected, not truncated');
        assert.ok(document.querySelector('[aria-invalid="true"]'));
        await paste(0, 'ab');
        assert.equal(currentValue, 'AB');
        assert.equal(document.activeElement, inputs[2]);
        await key(2, 'Backspace');
        assert.equal(currentValue, 'A');
        assert.equal(document.activeElement, inputs[1]);
        await paste(0, 'ABCD@345');
        assert.equal(currentValue, '');
        assert.equal(isInvitationCodeComplete('ABCDEFGH9'), false);
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});
