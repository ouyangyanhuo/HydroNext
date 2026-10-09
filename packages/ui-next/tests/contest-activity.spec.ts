import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('foreground activity reports focus/visibility changes, resumes on reconnect, and clears heartbeat on exit', async () => {
    const { JSDOM } = require('jsdom');
    const React = require('react');
    const { act, createElement: h } = React;
    const { createRoot } = require('react-dom/client');
    const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://oj.example/d/team/p/1' });
    const previous = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    }
    let focused = true;
    let visible = true;
    dom.window.document.hasFocus = () => focused;
    Object.defineProperty(dom.window.document, 'visibilityState', { get: () => visible ? 'visible' : 'hidden' });
    const timers = new Map<number, () => void>();
    dom.window.setInterval = ((callback: () => void, delay: number) => {
        assert.equal(delay, 10_000);
        timers.set(1, callback);
        return 1;
    }) as any;
    dom.window.clearInterval = (id: number) => { timers.delete(id); };
    const messages: any[] = [];
    const send = (payload: any) => messages.push(payload);
    let callbacks: any;
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../src/hooks/use-contest-activity.ts', import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code;
    runInNewContext(code, {
        module, exports: module.exports, window: dom.window, document: dom.window.document,
        require: (name: string) => name === './use-websocket' ? {
            useWebSocket: (options: any) => { callbacks = options; return { send }; },
        } : require(name),
    });
    let displayed: any;
    function Receiver({ enabled = true, pid = 1 }: any) {
        displayed = module.exports.useContestActivity('contest-id', pid, enabled);
        return null;
    }
    const root = createRoot(dom.window.document.getElementById('root'));
    try {
        await act(async () => root.render(h(Receiver)));
        assert.equal(callbacks.url, 'contest/contest-id/activity-conn?pid=1');
        callbacks.onOpen(send);
        assert.equal(messages.at(-1).active, true);
        await act(async () => callbacks.onMessage({ elapsed: 10_000 }));
        assert.equal(displayed.elapsed, 10_000);
        focused = false;
        dom.window.dispatchEvent(new dom.window.Event('blur'));
        assert.equal(messages.at(-1).active, false);
        visible = false;
        dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
        assert.equal(messages.at(-1).active, false);
        callbacks.onClose();
        const count = messages.length;
        timers.get(1)!();
        assert.equal(messages.length, count);
        focused = true;
        visible = true;
        callbacks.onOpen(send);
        assert.equal(messages.at(-1).active, true);
        await act(async () => root.render(h(Receiver, { enabled: false })));
        assert.equal(displayed, null);
        assert.equal(timers.size, 0);
    } finally {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete (globalThis as any)[key];
        }
    }
});
