import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'https://oj.example/d/exam/p/1' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as any)[key];
    }
});
const { act, createElement: h, StrictMode } = require('react');
const { createRoot } = require('react-dom/client');

async function fixture(options: Record<string, any> = {}, record = false, strict = false) {
    let now = 0;
    let nextTimer = 0;
    const timers = new Map<number, { at: number, interval: number, callback: () => void }>();
    const timer = (callback: () => void, delay: number, interval = 0) => {
        const id = ++nextTimer;
        timers.set(id, { callback, at: now + delay, interval });
        return id;
    };
    const clear = (id: number) => { timers.delete(id); };
    const window = new dom.window.EventTarget() as any;
    const document = new dom.window.EventTarget() as any;
    document.visibilityState = 'visible';
    Object.assign(window, {
        document, location: dom.window.location,
        setInterval: (callback: () => void, delay: number) => timer(callback, delay, delay), clearInterval: clear,
    });
    const sockets: FakeSocket[] = [];
    class FakeSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 0;
        onopen: (() => void) | null = null;
        onmessage: ((event: any) => void) | null = null;
        onclose: ((event: any) => void) | null = null;
        onerror: ((event: any) => void) | null = null;
        messages: string[] = [];
        closes = 0;
        throwSend = false;
        url: string;
        constructor(url: string) {
            this.url = url;
            sockets.push(this);
        }

        send(data: string) {
            if (this.throwSend) throw new Error('Network unavailable');
            this.messages.push(data);
        }

        // Deliberately do not emit close: a half-open network may never deliver that event.
        close() { this.closes++; this.readyState = FakeSocket.CLOSING; }
        open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
        receive(data: string) { this.onmessage?.({ data }); }
        end(code = 1006) { this.readyState = FakeSocket.CLOSED; this.onclose?.({ code }); }
    }
    let ui = { ws_prefix: '/d/exam/', domainId: 'exam' };
    const session = { useSessionStore: (selector: any) => selector({ ui }) };
    function load(path: string, mocks: Record<string, any>) {
        const module = { exports: {} as any };
        const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
        runInNewContext(code, {
            module, exports: module.exports, window, URL, URLSearchParams, WebSocket: FakeSocket, Date: { now: () => now },
            setTimeout: (callback: () => void, delay: number) => timer(callback, delay), clearTimeout: clear,
            require: (name: string) => mocks[name] || require(name),
        });
        return module.exports;
    }
    const socketHook = load('../src/hooks/use-websocket.ts', { '@/stores/session': session });
    const recordHook = load('../src/hooks/use-record-socket.ts', {
        '@/stores/session': session, './use-websocket': socketHook,
        '@/utils/record-socket-url': load('../src/utils/record-socket-url.ts', {}),
    });
    let rid = '1234567890abcdef12345678';
    let result: any;
    let opens = 0;
    let closes = 0;
    const received: any[] = [];
    let props = {
        url: 'contest-announcements-conn',
        onOpen: (send: (data: any) => void) => { opens++; send({ subscribe: true }); },
        onClose: () => { closes++; },
        onMessage: (data: any) => received.push(data),
        ...options,
    };
    function Receiver() {
        result = record ? recordHook.useRecordSocket(rid) : socketHook.useWebSocket(props);
        return null;
    }
    const host = dom.window.document.createElement('div');
    dom.window.document.body.append(host);
    const root = createRoot(host);
    const content = () => strict ? h(StrictMode, null, h(Receiver)) : h(Receiver);
    await act(async () => root.render(content()));
    const advance = async (milliseconds: number) => {
        const target = now + milliseconds;
        await act(async () => {
            for (;;) {
                const next = [...timers.entries()].filter(([, entry]) => entry.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                const [id, entry] = next;
                now = entry.at;
                if (entry.interval) entry.at += entry.interval;
                else timers.delete(id);
                entry.callback();
            }
            now = target;
        });
    };
    const event = async (name: string) => act(async () => {
        (name === 'visibilitychange' ? document : window).dispatchEvent(new dom.window.Event(name));
    });
    return {
        sockets, advance, event, received, window, document, timers,
        get result() { return result; },
        get opens() { return opens; },
        get closes() { return closes; },
        open: async (index = sockets.length - 1) => act(async () => sockets[index].open()),
        receive: async (data: string, index = sockets.length - 1) => act(async () => sockets[index].receive(data)),
        end: async (code = 1006) => act(async () => sockets.at(-1)!.end(code)),
        sleep(milliseconds: number) {
            now += milliseconds;
            // Drop missed interval ticks as browsers do; the next tick checks elapsed time.
            for (const entry of timers.values()) if (entry.interval) entry.at = now + entry.interval;
        },
        async render(next: { prefix?: string, domain?: string, rid?: string, options?: Record<string, any> } = {}) {
            ui = { ws_prefix: next.prefix ?? ui.ws_prefix, domainId: next.domain ?? ui.domainId };
            rid = next.rid ?? rid;
            props = { ...props, ...next.options };
            await act(async () => root.render(content()));
        },
        async close() {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

test('explicit domain sockets preserve scope with root, pre-scoped and custom WebSocket prefixes', async () => {
    const path = 'contest/1234567890abcdef12345678/activity-conn?pid=1';
    const f = await fixture({ url: path, domainId: 'exam' });
    try {
        assert.equal(f.sockets[0].url, `wss://oj.example/d/exam/${path}`);
        await f.render({ prefix: '/' });
        assert.equal(f.sockets.at(-1)!.url, `wss://oj.example/d/exam/${path}`);
        await f.render({ prefix: '/d/old/' });
        assert.equal(f.sockets.at(-1)!.url, `wss://oj.example/d/exam/${path}`);
        await f.render({ prefix: 'wss://socket.example/edge/' });
        assert.equal(f.sockets.at(-1)!.url, `wss://socket.example/edge/d/exam/${path}`);
        await f.render({ prefix: 'wss://socket.example/edge/d/old/' });
        assert.equal(f.sockets.at(-1)!.url, `wss://socket.example/edge/d/exam/${path}`);
        await f.render({ options: { domainId: 'system' } });
        assert.equal(f.sockets.at(-1)!.url, `wss://socket.example/edge/d/system/${path}`);
    } finally { await f.close(); }
});

test('all incoming frames refresh liveness, including ping, pong and non-JSON data', async () => {
    const f = await fixture();
    try {
        await f.open();
        await f.advance(110_000);
        await f.receive('ping');
        assert.equal(f.sockets[0].messages.at(-1), 'pong');
        await f.advance(110_000);
        await f.receive('not-json');
        await f.advance(110_000);
        await f.receive('pong');
        await f.advance(110_000);
        assert.equal(f.sockets.length, 1);
        assert.equal(f.sockets[0].messages.filter((message) => message === 'ping').length, 0);
        assert.equal(f.received.length, 0);
        await f.receive('{"ready":true}');
        assert.equal(f.received[0].ready, true);
    } finally { await f.close(); }
});

test('silent OPEN sockets are probed after 120 seconds and replaced without waiting for close', async () => {
    const f = await fixture();
    try {
        await f.open();
        const old = f.sockets[0];
        const staleMessage = old.onmessage!;
        const staleClose = old.onclose!;
        const staleError = old.onerror!;
        await f.advance(120_000);
        assert.equal(old.messages.at(-1), 'ping');
        assert.equal(old.closes, 0);
        await f.advance(10_000);
        assert.equal(old.closes, 1);
        assert.equal(f.result.ws.current, null);
        await f.advance(3000);
        assert.equal(f.sockets.length, 2);
        await f.open();
        assert.equal(f.opens, 2);
        assert.deepEqual(f.sockets[1].messages, ['{"subscribe":true}']);
        staleMessage({ data: '{"stale":true}' });
        staleClose({ code: 4001 });
        staleError(new dom.window.Event('error'));
        assert.equal(f.received.length, 0);
        assert.equal(f.closes, 1);
        assert.equal(f.result.ws.current, f.sockets[1]);
    } finally { await f.close(); }
});

test('a probe response cancels recovery and callback changes do not recreate a healthy connection', async () => {
    const f = await fixture();
    try {
        await f.open();
        await f.advance(120_000);
        await f.receive('pong');
        await f.advance(20_000);
        await f.render({ options: { onMessage: (data: any) => f.received.push(data) } });
        await f.receive('{"latest":true}');
        assert.equal(f.received[0].latest, true);
        assert.equal(f.sockets.length, 1);
        assert.equal(f.sockets[0].closes, 0);
    } finally { await f.close(); }
});

test('StrictMode teardown leaves only one live connection and cleans up both effect lifetimes', async () => {
    const f = await fixture({}, false, true);
    try {
        assert.equal(f.sockets.length, 2);
        assert.equal(f.sockets[0].closes, 1);
        assert.equal(f.timers.size, 1);
        await f.open();
        assert.equal(f.opens, 1);
        await f.advance(120_000);
        assert.equal(f.sockets[0].messages.length, 0);
        assert.equal(f.sockets[1].messages.at(-1), 'ping');
    } finally { await f.close(); }
    assert.equal(f.timers.size, 0);
});

test('configured thresholds replace defaults and backwards clock changes do not indefinitely delay detection', async () => {
    const f = await fixture({ heartbeatTimeout: 30_000, heartbeatProbeTimeout: 5000, connectionTimeout: 15_000 });
    try {
        await f.advance(15_000);
        assert.equal(f.sockets[0].closes, 1);
        await f.advance(3000);
        await f.open();
        f.sleep(-3_600_000);
        await f.advance(5000);
        await f.advance(30_000);
        assert.equal(f.sockets[1].messages.at(-1), 'ping');
        await f.advance(5000);
        assert.equal(f.sockets[1].closes, 1);
    } finally { await f.close(); }
});

test('stuck handshakes and send errors recover even if the browser never emits close', async () => {
    const f = await fixture();
    try {
        await f.advance(30_000);
        assert.equal(f.sockets[0].closes, 1);
        await f.advance(3000);
        await f.open();
        f.sockets[1].throwSend = true;
        f.result.send({ active: true });
        assert.equal(f.sockets[1].closes, 1);
        await f.advance(3000);
        assert.equal(f.sockets.length, 3);
    } finally { await f.close(); }
});

test('offline is only a hint, online probes the socket and can bypass a pending reconnect delay', async () => {
    const f = await fixture();
    try {
        await f.open();
        await f.event('offline');
        assert.equal(f.sockets[0].closes, 0);
        await f.event('online');
        assert.equal(f.sockets[0].messages.at(-1), 'ping');
        await f.receive('pong');
        await f.end();
        await f.event('online');
        assert.equal(f.sockets.length, 2);
        await f.advance(3000);
        assert.equal(f.sockets.length, 2);
    } finally { await f.close(); }
});

test('pageshow after sleep grants a fresh probe window instead of immediately expiring it', async () => {
    const f = await fixture();
    try {
        await f.open();
        await f.advance(120_000);
        f.sleep(300_000);
        await f.event('pageshow');
        assert.equal(f.sockets[0].messages.filter((message) => message === 'ping').length, 2);
        assert.equal(f.sockets[0].closes, 0);
        await f.receive('pong');
        await f.advance(10_000);
        assert.equal(f.sockets.length, 1);
    } finally { await f.close(); }
});

test('delayed watchdog ticks and visibility/focus recovery do not treat a suspended browser as immediately dead', async () => {
    const f = await fixture();
    try {
        await f.open();
        await f.advance(120_000);
        f.sleep(300_000);
        await f.advance(10_000);
        assert.equal(f.sockets[0].closes, 0);
        await f.receive('pong');
        f.sleep(130_000);
        f.document.visibilityState = 'hidden';
        await f.event('visibilitychange');
        assert.equal(f.sockets[0].messages.filter((message) => message === 'ping').length, 2);
        f.document.visibilityState = 'visible';
        await f.event('visibilitychange');
        assert.equal(f.sockets[0].messages.at(-1), 'ping');
        await f.receive('pong');
        f.sleep(130_000);
        await f.event('focus');
        assert.equal(f.sockets[0].messages.filter((message) => message === 'ping').length, 4);
    } finally { await f.close(); }
});

test('transport-level normal closure can recover because it is not an explicit business completion', async () => {
    const f = await fixture();
    try {
        await f.open();
        await f.end(1000);
        await f.advance(3000);
        assert.equal(f.sockets.length, 2);
        await f.open();
        assert.equal(f.opens, 2);
    } finally { await f.close(); }
});

for (const code of [1008, 4000, 4001]) {
    test(`close code ${code} stays closed through timers and all recovery events`, async () => {
        const f = await fixture();
        try {
            await f.open();
            await f.end(code);
            await f.event('online');
            await f.event('pageshow');
            await f.event('focus');
            await f.event('visibilitychange');
            await f.advance(300_000);
            assert.equal(f.sockets.length, 1, String(code));
        } finally { await f.close(); }
    });
}

for (const options of [{ autoReconnect: false }, { enabled: false }]) {
    test(`${Object.keys(options)[0]} false never recovers implicitly`, async () => {
        const f = await fixture(options);
        try {
            if (options.enabled !== false) {
                await f.open();
                await f.end();
            }
            await f.event('online');
            await f.advance(300_000);
            assert.equal(f.sockets.length, options.enabled === false ? 0 : 1);
        } finally { await f.close(); }
    });
}

test('domain changes discard queued messages and old events; unmount removes timers and recovery listeners', async () => {
    const f = await fixture();
    f.result.send({ oldDomain: true });
    const staleOpen = f.sockets[0].onopen!;
    await f.render({ prefix: '/d/other/', domain: 'other' });
    await f.open();
    staleOpen();
    assert.equal(f.sockets[1].url, 'wss://oj.example/d/other/contest-announcements-conn');
    assert.deepEqual(f.sockets[1].messages, ['{"subscribe":true}']);
    await f.end();
    await f.close();
    assert.equal(f.timers.size, 0);
    await f.event('online');
    await f.event('pageshow');
    await f.advance(300_000);
    assert.equal(f.sockets.length, 2);
});

test('an explicit secure WebSocket prefix is never downgraded during connection recovery', async () => {
    const f = await fixture();
    try {
        await f.render({ prefix: 'wss://socket.example/d/exam/' });
        assert.equal(f.sockets[1].url, 'wss://socket.example/d/exam/contest-announcements-conn');
        await f.open();
        await f.end();
        await f.advance(3000);
        assert.equal(f.sockets[2].url, f.sockets[1].url);
    } finally { await f.close(); }
});

test('record subscriptions recover their current snapshot, stop on Ended and never leak another record or domain', async () => {
    const f = await fixture({}, true);
    try {
        await f.open();
        await f.receive('{"rdoc":{"_id":"1234567890abcdef12345678","status":0,"compilerText":"old"}}');
        assert.equal(f.result.status, 0);
        await f.end();
        await f.advance(5000);
        assert.equal(f.sockets.length, 2);
        assert.ok(f.sockets[1].url.includes('domainId=exam'));
        assert.ok(f.sockets[1].url.includes('rid=1234567890abcdef12345678'));
        await f.open();
        await f.receive('{"rdoc":{"_id":"1234567890abcdef12345678","status":1,"score":100}}');
        assert.equal(f.result.score, 100);
        await f.end(4001);
        await f.event('online');
        await f.advance(10_000);
        assert.equal(f.sockets.length, 2);
        await f.render({ domain: 'other', prefix: '/d/other/' });
        assert.equal(f.result, null);
        await f.open();
        await f.receive('{"rdoc":{"_id":"1234567890abcdef12345678","status":0}}');
        assert.equal(f.result.compilerText, undefined);
        assert.equal(f.result.score, undefined);
        await f.render({ rid: 'abcdef1234567890abcdef12' });
        assert.equal(f.result, null);
        await f.open();
        await f.receive('{"rdoc":{"_id":"1234567890abcdef12345678","status":1}}');
        assert.equal(f.result, null);
        await f.receive('{"rdoc":{"_id":"abcdef1234567890abcdef12","status":1}}');
        assert.equal(f.result.status, 1);
    } finally { await f.close(); }
});
