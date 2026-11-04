import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { after, test } from 'node:test';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const { act, createElement: h } = require('react');
const { createRoot } = require('react-dom/client');
const dom = new JSDOM('<html><body></body></html>', { pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
let now = 10_000;
let visible = true;
Object.defineProperty(dom.window.document, 'visibilityState', { get: () => visible ? 'visible' : 'hidden' });
const module = { exports: {} as any };
runInNewContext(transformSync(readFileSync(new URL('../src/components/common/rolling-clock.tsx', import.meta.url), 'utf8'), {
    loader: 'tsx', format: 'cjs', jsx: 'automatic',
}).code, { module, exports: module.exports, require, document: dom.window.document, Date: { now: () => now } });
const { RollingClock } = module.exports;
after(() => {
    dom.window.close();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(value: string, seconds: number) {
    visible = true;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = async (next: string, time: number, animate = true) => {
        await act(async () => root.render(h(RollingClock, { value: next, seconds: time, animate, style: { minInlineSize: '8ch' } })));
    };
    await render(value, seconds);
    return { host, render, close: async () => {
        await act(async () => root.unmount()); host.remove();
    } };
}

test('clock rolls only changed digits across carry/borrow and exposes a single accessible current value', async () => {
    const view = await fixture('00:00:59', 59);
    try {
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 0, 'initial render must not animate');
        const first = view.host.querySelector('.hydro-rolling-clock__digit');
        now += 1000;
        await view.render('00:01:00', 60);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 2);
        const seconds = view.host.querySelector('.hydro-rolling-clock__digit--group')!;
        assert.equal((seconds as HTMLElement).style.width, '2ch');
        assert.equal(seconds.querySelector('.hydro-rolling-clock__glyph--out')?.textContent, '59');
        assert.equal(seconds.querySelector('.hydro-rolling-clock__glyph--in')?.textContent, '00');
        assert.equal(view.host.querySelector('.hydro-rolling-clock__digit'), first, 'unchanged columns stay mounted');
        const timer = view.host.querySelector('[role="timer"]')!;
        assert.equal(timer.getAttribute('aria-label'), '00:01:00');
        assert.equal(timer.getAttribute('data-direction'), 'up');
        assert.equal(timer.getAttribute('aria-live'), 'off');
        assert.equal(timer.firstElementChild?.getAttribute('aria-hidden'), 'true');
        assert.equal((timer as HTMLElement).style.minInlineSize, '8ch');
        const incoming = view.host.querySelector('.hydro-rolling-clock__glyph--in')!;
        await act(async () => incoming.dispatchEvent(new dom.window.Event('animationend', { bubbles: true })));
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 0);
        assert.equal(timer.textContent, '00:01:00');
        now += 1000;
        await view.render('00:00:59', 59);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 2);
        assert.equal(timer.getAttribute('data-direction'), 'down');
        assert.equal(view.host.querySelector('.hydro-rolling-clock__digit--group .hydro-rolling-clock__glyph--in')?.textContent, '59');
        now += 1000;
        await view.render('00:00:58', 58);
        assert.equal(view.host.querySelectorAll('.hydro-rolling-clock__glyph--out').length, 1, 'interrupted transitions never accumulate');
        await view.render('00:00:58', 58, false);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 0);
        await view.render('00:00:58', 58, true);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 0, 'restarting playback must not replay an old transition');
        await view.render('00:59:59', 3599);
        now += 1000;
        await view.render('01:00:00', 3600);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 3);
        assert.equal(view.host.querySelectorAll('.hydro-rolling-clock__digit--group').length, 2);
        now += 1000;
        await view.render('00:59:59', 3599);
        assert.equal(view.host.querySelectorAll('.hydro-rolling-clock__digit--group').length, 2);
        assert.equal(timer.getAttribute('data-direction'), 'down');
    } finally { await view.close(); }
});

test('clock snaps on seeks, resume, placeholders, width changes and explicit animation opt-out', async () => {
    const view = await fixture('00:00:00', 0);
    try {
        const check = () => assert.equal(view.host.querySelectorAll('[data-moving]').length, 0);
        now += 1000;
        await view.render('00:05:00', 300); check();
        now += 5000;
        await view.render('00:05:01', 301); check();
        visible = false;
        now += 1000;
        await view.render('00:05:02', 302); check();
        visible = true;
        now += 1000;
        await view.render('00:05:03', 303, false); check();
        await view.render('—', Number.NaN); check();
        await view.render('99:59:59', 359999); check();
        await view.render('100:00:00', 360000); check();
        assert.equal(view.host.querySelector('[role="timer"]')?.getAttribute('aria-label'), '100:00:00');
    } finally { await view.close(); }
});

test('localized duration labels stay still while their numeric columns roll', async () => {
    const view = await fixture('1天 02时 03分 04秒', 93784);
    try {
        now += 1000;
        await view.render('1天 02时 03分 05秒', 93785);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 1);
        assert.equal([...view.host.querySelectorAll('.hydro-rolling-clock__separator')].map((node) => node.textContent).join(''), '天 时 分 秒');
    } finally { await view.close(); }
});

test('motion styles include edge masks, local glyph blur and a no-animation reduced-motion fallback', () => {
    const css = postcss.parse(readFileSync(new URL('../src/styles/rolling-clock.css', import.meta.url), 'utf8'));
    const declarations: string[] = [];
    css.walkDecls((decl) => { declarations.push(`${decl.prop}:${decl.value}`); });
    assert.ok(declarations.some((value) => value.startsWith('mask-image:linear-gradient')));
    assert.ok(declarations.includes('filter:blur(1.5px)'));
    assert.ok(declarations.includes('--hydro-clock-duration:760ms'));
    assert.ok(declarations.includes('--hydro-clock-easing:cubic-bezier(0.45, 0, 0.25, 1)'));
    assert.ok(declarations.includes('transform:translateY(var(--hydro-clock-enter))'));
    assert.ok(declarations.includes('transform:translateY(var(--hydro-clock-exit))'));
    assert.ok(declarations.includes('width:1ch'));
    assert.ok(!declarations.some((value) => value.startsWith('backdrop-filter:')));
    const media = css.nodes.find((node) => node.type === 'atrule' && node.name === 'media' && node.params === '(prefers-reduced-motion: reduce)');
    assert.ok(media);
    assert.match(media.toString(), /animation: none/);
    assert.match(media.toString(), /display: none/);
});
