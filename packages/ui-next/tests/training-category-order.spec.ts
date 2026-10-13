import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { moveTrainingCategory } from '../src/utils/training-category-order.ts';

const require = createRequire(import.meta.url);

test('moving categories preserves the complete list, supports both directions and ignores foreign IDs', () => {
    const ids = ['a', 'b', 'c'];
    assert.deepEqual(moveTrainingCategory(ids, 'a', 'c'), ['b', 'c', 'a']);
    assert.deepEqual(moveTrainingCategory(ids, 'c', 'a'), ['c', 'a', 'b']);
    assert.equal(moveTrainingCategory(ids, 'a', 'a'), ids);
    assert.equal(moveTrainingCategory(ids, 'foreign', 'b'), ids);
    assert.equal(moveTrainingCategory(ids, 'a', 'foreign'), ids);
    assert.deepEqual(ids, ['a', 'b', 'c']);
});

test('category handles support pointer drag, keyboard reorder, cancel, and disabled saving state', async () => {
    const { JSDOM } = require('jsdom');
    const { act, createElement: h, useState } = require('react');
    const { createRoot } = require('react-dom/client');
    const dom = new JSDOM('<html><body><div id="root"></div></body></html>');
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    let ids = ['a', 'b', 'c'];
    const plain = ({ children, ...props }: any) => h('div', {
        className: props.className, role: props.role, 'data-category-id': props['data-category-id'], 'data-dragging': props['data-dragging'],
    }, children);
    const mocks: any = {
        '@mantine/core': { Badge: plain, Group: plain, Text: plain },
        '@tabler/icons-react': { IconGripVertical: () => null },
        '@/components/common/button': { ActionIcon: ({ children, variant: _variant, ...props }: any) => h('button', props, children) },
        '@/hooks/use-i18n': { useI18n: () => ({ t: (key: string) => key }) },
        '@/utils/training-category-order': { moveTrainingCategory },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/components/training/training-category-order.tsx', import.meta.url), 'utf8'),
        { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    runInNewContext(code, { module, exports: module.exports, require: (name: string) => mocks[name] || require(name) });
    const categories = [{ _id: 'a', name: 'A', tids: [] }, { _id: 'b', name: 'B', tids: [] }, { _id: 'c', name: 'C', tids: [] }];
    function Harness({ disabled = false }: any) {
        const [value, setValue] = useState(ids);
        return h(module.exports.TrainingCategoryOrder, { categories, ids: value, disabled,
            onChange: (next: string[]) => { ids = Array.from(next); setValue(ids); } });
    }
    const root = createRoot(dom.window.document.getElementById('root'));
    const handle = (id: string) => dom.window.document.querySelector(`[data-category-id="${id}"] button`)!;
    function pointer(type: string, x: number, y: number) {
        const event = new dom.window.Event(type, { bubbles: true });
        Object.assign(event, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });
        return event;
    }
    try {
        dom.window.HTMLElement.prototype.setPointerCapture = () => undefined;
        await act(async () => root.render(h(Harness)));
        await act(async () => handle('c').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })));
        assert.deepEqual(ids, ['a', 'c', 'b']);
        dom.window.document.elementFromPoint = () => dom.window.document.querySelector('[data-category-id="b"]');
        await act(async () => handle('a').dispatchEvent(pointer('pointerdown', 0, 0)));
        await act(async () => handle('a').dispatchEvent(pointer('pointermove', 10, 50)));
        assert.deepEqual(ids, ['c', 'b', 'a']);
        await act(async () => handle('a').dispatchEvent(pointer('pointercancel', 10, 50)));
        assert.deepEqual(ids, ['a', 'c', 'b']);
        await act(async () => handle('a').dispatchEvent(pointer('pointerdown', 0, 0)));
        await act(async () => handle('a').dispatchEvent(pointer('pointermove', 10, 50)));
        await act(async () => handle('a').dispatchEvent(pointer('pointerup', 10, 50)));
        assert.deepEqual(ids, ['c', 'b', 'a']);
        await act(async () => root.render(h(Harness, { disabled: true })));
        await act(async () => handle('a').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })));
        assert.deepEqual(ids, ['c', 'b', 'a']);
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});

test('sort entry is permission-gated, sends a complete order with its base and retains the active domain', () => {
    const source = readFileSync(new URL('../src/pages/training_main.tsx', import.meta.url), 'utf8');
    assert.match(source, /opened=\{categorySortOpened && canCreateTraining\}/);
    assert.match(source, /operation: 'sort_category', ids: categorySortIds, previousIds: categorySortBase/);
    assert.match(source, /sortingDomain\.current !== domainId/);
    assert.match(source, /activeDomain\.current !== requestDomain/);
    assert.match(source, /categorySortPending\.current = true/);
});
