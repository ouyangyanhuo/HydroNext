import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { bindFloatingDrag, clampFloatingPosition, CONTEST_TIMER_POSITION_KEY, readFloatingPosition } from '../src/utils/floating-position.ts';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

test('saved positions are validated and clamped on small viewports', () => {
    assert.deepEqual(clampFloatingPosition({ x: -100, y: 900 }, { x: 400, y: 300 }, { x: 300, y: 60 }), { x: 8, y: 232 });
    assert.deepEqual(clampFloatingPosition({ x: 800, y: 800 }, { x: 100, y: 40 }, { x: 300, y: 60 }), { x: 8, y: 8 });
    for (const value of ['invalid', 'null', '{}', '{"x":"30","y":20}', '{"x":1e999,"y":20}']) {
        assert.equal(readFloatingPosition({ getItem: () => value }, 'key'), null);
    }
    assert.equal(readFloatingPosition({ getItem: () => { throw new Error('Blocked'); } }, 'key'), null);
});

test('pointer dragging is frame-batched, persists after release and restores across problems', () => {
    const dom = new JSDOM('<div id="timer"><button id="handle"></button><a id="link">Contest</a></div>', { url: 'https://oj.example' });
    const view = dom.window;
    const element = view.document.getElementById('timer')!;
    const handle = view.document.getElementById('handle')!;
    element.getBoundingClientRect = () => ({ width: 300, height: 60 }) as any;
    Object.assign(view, { innerWidth: 1200, innerHeight: 900 });
    const frames = new Map<number, () => void>();
    let frameId = 0;
    view.requestAnimationFrame = (callback: any) => {
        frames.set(++frameId, callback);
        return frameId;
    };
    view.cancelAnimationFrame = (value: number) => { frames.delete(value); };
    const oldObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} disconnect() {} } });
    let captured = false;
    Object.assign(handle, {
        setPointerCapture: () => { captured = true; }, hasPointerCapture: () => captured,
        releasePointerCapture: () => { captured = false; },
    });
    const pointer = (type: string, x: number, y: number) => handle.dispatchEvent(Object.assign(new view.Event(type, { cancelable: true }), {
        pointerId: 1, button: 0, clientX: x, clientY: y,
    }));
    try {
        let cleanup = bindFloatingDrag(element, handle, CONTEST_TIMER_POSITION_KEY);
        assert.match(element.style.transform, /16px, 824px/);
        pointer('pointerdown', 20, 830);
        pointer('pointermove', 300, 300);
        pointer('pointermove', 400, 200);
        assert.equal(frames.size, 1);
        for (const callback of frames.values()) callback();
        frames.clear();
        assert.match(element.style.transform, /396px, 194px/);
        pointer('pointerup', 400, 200);
        assert.equal(captured, false);
        assert.deepEqual(readFloatingPosition(view.localStorage, CONTEST_TIMER_POSITION_KEY), { x: 396, y: 194 });
        cleanup();
        cleanup = bindFloatingDrag(element, handle, CONTEST_TIMER_POSITION_KEY);
        assert.match(element.style.transform, /396px, 194px/);
        handle.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        assert.equal(readFloatingPosition(view.localStorage, CONTEST_TIMER_POSITION_KEY)?.x, 388);
        Object.assign(view, { innerWidth: 400, innerHeight: 200 });
        view.dispatchEvent(new view.Event('resize'));
        for (const callback of frames.values()) callback();
        assert.match(element.style.transform, /92px, 132px/);
        handle.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Home' }));
        assert.deepEqual(readFloatingPosition(view.localStorage, CONTEST_TIMER_POSITION_KEY), { x: 16, y: 124 });
        cleanup();
    } finally {
        dom.window.close();
        if (oldObserver) Object.defineProperty(globalThis, 'ResizeObserver', oldObserver);
        else delete (globalThis as any).ResizeObserver;
    }
});
