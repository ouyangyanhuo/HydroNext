import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { moveTrainingCategory, trainingCategoryDropIndex, trainingCategoryScrollSpeed } from '../src/utils/training-category-order.ts';

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

test('category drag previews are frame-batched and commit only on release, with cancellation, keyboard and disabled support', async () => {
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
    let changes = 0;
    const frames = new Map<number, (time: number) => void>();
    let frameId = 0;
    let time = 0;
    const animations: any[] = [];
    dom.window.requestAnimationFrame = (callback: (time: number) => void) => {
        frames.set(++frameId, callback);
        return frameId;
    };
    dom.window.cancelAnimationFrame = (id: number) => frames.delete(id);
    dom.window.matchMedia = () => ({ matches: false });
    dom.window.HTMLElement.prototype.animate = function animate(keyframes: any) {
        animations.push(keyframes);
        return { cancel() {} };
    };
    dom.window.HTMLElement.prototype.getBoundingClientRect = function bounds() {
        const rows = Array.from(dom.window.document.querySelectorAll('[data-category-id]'));
        const index = rows.indexOf(this);
        const shift = Number(this.style.transform.match(/translate3d\(0, ([\d.-]+)px/)?.[1] || 0);
        const top = index < 0 ? 0 : index * 48 + shift;
        return { top, bottom: index < 0 ? 144 : top + 40, left: 0, right: 320, width: 320, height: index < 0 ? 144 : 40 };
    };
    const translate = (key: string, ...values: any[]) => key.replace(/\{(\d+)\}/g, (_: string, index: string) => String(values[+index]));
    const plain = ({ children, ...props }: any) => h('div', {
        className: props.className, role: props.role, 'data-category-id': props['data-category-id'], 'data-dragging': props['data-dragging'],
    }, children);
    const mocks: any = {
        '@mantine/core': { Badge: plain, Group: plain, Text: plain },
        '@tabler/icons-react': { IconGripVertical: () => null },
        '@/components/common/button': { ActionIcon: ({ children, variant: _variant, ...props }: any) => h('button', props, children) },
        '@/hooks/use-i18n': { useI18n: () => ({ t: translate }) },
        '@/utils/training-category-order': { moveTrainingCategory, trainingCategoryDropIndex, trainingCategoryScrollSpeed },
    };
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/components/training/training-category-order.tsx', import.meta.url), 'utf8'),
        { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    runInNewContext(code, { module, exports: module.exports, window: dom.window, performance: dom.window.performance,
        require: (name: string) => mocks[name] || require(name) });
    const categories = [{ _id: 'a', name: 'A', tids: [] }, { _id: 'b', name: 'B', tids: [] }, { _id: 'c', name: 'C', tids: [] }];
    function Harness({ disabled = false }: any) {
        const [value, setValue] = useState(ids);
        return h(module.exports.TrainingCategoryOrder, { categories, ids: value, disabled,
            onChange: (next: string[]) => {
                changes++;
                ids = Array.from(next);
                setValue(ids);
            } });
    }
    const root = createRoot(dom.window.document.getElementById('root'));
    const handle = (id: string) => dom.window.document.querySelector(`[data-category-id="${id}"] button`)!;
    function pointer(type: string, x: number, y: number) {
        const event = new dom.window.Event(type, { bubbles: true });
        Object.assign(event, { pointerId: 1, clientX: x, clientY: y, pointerType: 'mouse', button: 0 });
        return event;
    }
    const renderFrame = () => act(async () => {
        const pending = [...frames.values()];
        frames.clear();
        time += 16;
        for (const callback of pending) callback(time);
    });
    try {
        dom.window.HTMLElement.prototype.setPointerCapture = () => undefined;
        await act(async () => root.render(h(Harness)));
        await act(async () => handle('c').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })));
        assert.deepEqual(ids, ['a', 'c', 'b']);
        const list = dom.window.document.querySelector('.hydro-training-category-order')!;
        Object.defineProperty(list, 'clientHeight', { value: 144 });
        Object.defineProperty(list, 'scrollHeight', { value: 144, configurable: true });
        changes = 0;
        await act(async () => handle('a').dispatchEvent(pointer('pointerdown', 0, 0)));
        await act(async () => handle('a').dispatchEvent(pointer('pointermove', 10, 110)));
        await act(async () => handle('a').dispatchEvent(pointer('pointermove', 10, 115)));
        assert.equal(frames.size, 1);
        await renderFrame();
        assert.equal(changes, 0, 'Moving the pointer must not reorder controlled state');
        assert.deepEqual(ids, ['a', 'c', 'b']);
        assert.ok(handle('a').parentElement!.style.transform.includes('115px'));
        assert.equal((dom.window.document.querySelector('.hydro-training-category-order__marker') as HTMLElement).style.display, 'block');
        assert.ok(dom.window.document.body.textContent?.includes('Release to place at position 3'));
        await act(async () => handle('a').dispatchEvent(pointer('pointercancel', 10, 115)));
        assert.deepEqual(ids, ['a', 'c', 'b']);
        assert.equal(changes, 0);
        assert.equal(frames.size, 0);
        await act(async () => handle('a').dispatchEvent(pointer('pointerdown', 0, 0)));
        await act(async () => handle('a').dispatchEvent(pointer('pointermove', 10, 115)));
        await renderFrame();
        await act(async () => handle('a').dispatchEvent(pointer('pointerup', 10, 115)));
        assert.deepEqual(ids, ['c', 'b', 'a']);
        assert.equal(changes, 1);
        assert.ok(animations.length > 0, 'Landing and keyboard movements should animate');
        assert.equal(frames.size, 0);
        // Edge scrolling keeps advancing with no new pointer events.
        Object.defineProperty(list, 'scrollHeight', { value: 600, configurable: true });
        await act(async () => handle('c').dispatchEvent(pointer('pointerdown', 0, 10)));
        await act(async () => handle('c').dispatchEvent(pointer('pointermove', 10, 140)));
        await renderFrame();
        const firstScroll = list.scrollTop;
        await renderFrame();
        assert.ok(firstScroll > 0 && list.scrollTop > firstScroll);
        await act(async () => {
            for (let step = 0; step < 80; step++) {
                const pending = [...frames.values()];
                frames.clear();
                time += 16;
                for (const callback of pending) callback(time);
            }
        });
        assert.equal(list.scrollTop, 456, 'Auto-scroll stops at the original content boundary');
        assert.equal(frames.size, 0, 'A stationary pointer must not keep rendering at the scroll boundary');
        await act(async () => handle('c').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        assert.deepEqual(ids, ['c', 'b', 'a']);
        assert.equal(frames.size, 0);
        assert.ok(dom.window.document.body.textContent?.includes('Reordering cancelled'));
        await act(async () => root.render(h(Harness, { disabled: true })));
        await act(async () => handle('a').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })));
        assert.deepEqual(ids, ['c', 'b', 'a']);
        const beforeReduced = animations.length;
        dom.window.matchMedia = () => ({ matches: true });
        await act(async () => root.render(h(Harness)));
        await act(async () => handle('a').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })));
        assert.deepEqual(ids, ['c', 'a', 'b']);
        assert.equal(animations.length, beforeReduced, 'Reduced motion disables landing animations');
        const beforeOutside = changes;
        await act(async () => handle('c').dispatchEvent(pointer('pointerdown', 0, 0)));
        await act(async () => handle('c').dispatchEvent(pointer('pointermove', 10, 100)));
        await act(async () => handle('c').dispatchEvent(pointer('pointerup', 1000, 100)));
        assert.deepEqual(ids, ['c', 'a', 'b']);
        assert.equal(changes, beforeOutside, 'Dropping outside the list cancels the reorder');
    } finally {
        await act(async () => root.unmount());
        assert.equal(frames.size, 0);
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});

test('stable cached geometry uses midpoint thresholds with a dead zone instead of moving-row hit testing', () => {
    const slots = [{ top: 0, height: 40 }, { top: 48, height: 40 }, { top: 96, height: 40 }];
    assert.equal(trainingCategoryDropIndex(slots, 0, 69, 0), 0);
    assert.equal(trainingCategoryDropIndex(slots, 0, 73, 0), 1);
    assert.equal(trainingCategoryDropIndex(slots, 0, 67, 1), 1);
    assert.equal(trainingCategoryDropIndex(slots, 0, 63, 1), 0);
    assert.equal(trainingCategoryDropIndex(slots, 0, 130, 0), 2);
    assert.equal(trainingCategoryDropIndex(slots, 2, 0, 2), 0);
    assert.equal(trainingCategoryDropIndex([{ top: 0, height: 40 }], 0, 100, 0), 0);
    assert.equal(trainingCategoryScrollSpeed(100, 0, 200), 0);
    assert.equal(trainingCategoryScrollSpeed(0, 0, 200), -720);
    assert.equal(trainingCategoryScrollSpeed(200, 0, 200), 720);
    assert.equal(trainingCategoryScrollSpeed(0, 0, 0), 0);
});

test('sort entry is permission-gated, sends a complete order with its base and retains the active domain', () => {
    const source = readFileSync(new URL('../src/pages/training_main.tsx', import.meta.url), 'utf8');
    assert.match(source, /opened=\{categorySortOpened && canCreateTraining\}/);
    assert.match(source, /operation: 'sort_category', ids: categorySortIds, previousIds: categorySortBase/);
    assert.match(source, /sortingDomain\.current !== domainId/);
    assert.match(source, /activeDomain\.current !== requestDomain/);
    assert.match(source, /categorySortPending\.current = true/);
});
