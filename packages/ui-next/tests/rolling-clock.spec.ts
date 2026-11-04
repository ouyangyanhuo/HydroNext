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

function primaryTrack(host: HTMLElement, unit = 0) {
    const layer = `[data-unit="${unit}"] .hydro-rolling-clock__layer:not(.hydro-rolling-clock__layer--blurred)`;
    return host.querySelector(`${layer} .hydro-rolling-clock__track`)!;
}

test('clock rolls hours, minutes and seconds independently and carries on stable two-digit tracks', async () => {
    const view = await fixture('00:00:59', 59);
    try {
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 0, 'initial render must not animate');
        const sizer = view.host.querySelector('.hydro-rolling-clock__sizer');
        const hourTrack = primaryTrack(view.host);
        const separators = [...view.host.querySelectorAll('.hydro-rolling-clock__separator')];
        now += 1000;
        await view.render('00:01:00', 60);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 2);
        assert.equal(view.host.querySelector('.hydro-rolling-clock__sizer'), sizer);
        assert.equal(primaryTrack(view.host), hourTrack, 'unchanged hour track stays mounted and still');
        assert.deepEqual([...primaryTrack(view.host, 4).children].map((row) => row.textContent), ['59', '00']);
        assert.deepEqual([...primaryTrack(view.host, 2).children].map((row) => row.textContent), ['00', '01']);
        for (const unit of view.host.querySelectorAll<HTMLElement>('.hydro-rolling-clock__unit')) assert.equal(unit.style.width, '2ch');
        for (const separator of separators) {
            assert.equal(separator.parentElement?.className, 'hydro-rolling-clock__content');
            assert.equal(separator.closest('.hydro-rolling-clock__track'), null);
        }
        const timer = view.host.querySelector('[role="timer"]')!;
        assert.equal(timer.getAttribute('aria-label'), '00:01:00');
        assert.equal(timer.getAttribute('data-direction'), 'up');
        assert.equal(timer.getAttribute('aria-live'), 'off');
        assert.equal(timer.firstElementChild?.getAttribute('aria-hidden'), 'true');
        assert.equal((timer as HTMLElement).style.minInlineSize, '8ch');
        const track = primaryTrack(view.host, 4);
        await act(async () => track.dispatchEvent(new dom.window.Event('animationend', { bubbles: true })));
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 0);
        assert.equal(view.host.querySelector('.hydro-rolling-clock__sizer'), sizer);
        assert.equal(primaryTrack(view.host, 2).textContent, '01');
        assert.equal(primaryTrack(view.host, 4).textContent, '00');
        assert.deepEqual([...view.host.querySelectorAll('.hydro-rolling-clock__separator')], separators);
        now += 1000;
        await view.render('00:00:59', 59);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 2);
        assert.equal(timer.getAttribute('data-direction'), 'down');
        assert.equal(primaryTrack(view.host, 4).querySelector('[data-previous]')?.textContent, '00');
        assert.equal(primaryTrack(view.host, 4).firstElementChild?.textContent, '59');
        now += 1000;
        await view.render('00:00:58', 58);
        assert.equal(primaryTrack(view.host, 4).children.length, 2, 'interrupted transitions never accumulate');
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 1);
        assert.equal(view.host.querySelector('[data-moving]')?.getAttribute('data-unit'), '4');
        await view.render('00:00:58', 58, false);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 0);
        await view.render('00:00:58', 58, true);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 0, 'restarting playback must not replay an old transition');
        await view.render('00:59:59', 3599);
        now += 1000;
        await view.render('01:00:00', 3600);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 3);
        assert.deepEqual([...primaryTrack(view.host).children].map((row) => row.textContent), ['00', '01']);
        assert.deepEqual([...primaryTrack(view.host, 2).children].map((row) => row.textContent), ['59', '00']);
        assert.deepEqual([...primaryTrack(view.host, 4).children].map((row) => row.textContent), ['59', '00']);
        now += 1000;
        await view.render('00:59:59', 3599);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 3);
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
        now += 1000;
        await view.render('99:59:59', 359999);
        assert.equal(view.host.querySelector('[role="timer"]')?.getAttribute('aria-label'), '099:59:59');
        assert.equal((view.host.querySelector('[data-unit="0"]') as HTMLElement).style.width, '3ch');
    } finally { await view.close(); }
});

test('even unpadded localized values retain two digits and the same slots across minute carry and animation completion', async () => {
    const view = await fixture('0分59秒', 59);
    try {
        now += 1000;
        const separators = [...view.host.querySelectorAll('.hydro-rolling-clock__separator')];
        const units = [...view.host.querySelectorAll<HTMLElement>('.hydro-rolling-clock__unit')];
        await view.render('1分0秒', 60);
        assert.equal(view.host.querySelectorAll('[data-moving]').length, 2);
        assert.deepEqual(units.map((unit) => unit.querySelector('.hydro-rolling-clock__sizer')?.textContent), ['01', '00']);
        assert.deepEqual(units.map((unit) => unit.style.width), ['2ch', '2ch']);
        const track = primaryTrack(view.host, 2);
        assert.deepEqual([...track.children].map((row) => row.textContent), ['59', '00']);
        assert.deepEqual([...primaryTrack(view.host).children].map((row) => row.textContent), ['00', '01']);
        await act(async () => track.dispatchEvent(new dom.window.Event('animationend', { bubbles: true })));
        assert.deepEqual([...view.host.querySelectorAll('.hydro-rolling-clock__unit')], units);
        assert.equal(primaryTrack(view.host).textContent, '01');
        assert.equal(primaryTrack(view.host, 2).textContent, '00');
        assert.deepEqual([...view.host.querySelectorAll('.hydro-rolling-clock__separator')], separators);
        assert.deepEqual(separators.map((separator) => separator.textContent), ['分', '秒']);
        for (const separator of separators) assert.equal(separator.closest('.hydro-rolling-clock__unit'), null);
    } finally { await view.close(); }
});

test('motion uses only track transforms, static edge blur and non-shrinking numeric slots', () => {
    const css = postcss.parse(readFileSync(new URL('../src/styles/rolling-clock.css', import.meta.url), 'utf8'));
    const declarations: string[] = [];
    css.walkDecls((decl) => { declarations.push(`${decl.prop}:${decl.value}`); });
    assert.ok(declarations.some((value) => value.startsWith('mask-image:linear-gradient')));
    assert.ok(declarations.includes('filter:blur(0.75px)'));
    assert.ok(declarations.includes('--hydro-clock-duration:560ms'));
    assert.ok(declarations.includes('transform:translateY(var(--hydro-clock-start))'));
    assert.ok(declarations.includes('transform:translateY(var(--hydro-clock-end))'));
    assert.ok(declarations.includes('min-width:2ch'));
    assert.ok(declarations.includes('flex:none'));
    css.walkAtRules('keyframes', (rule) => {
        rule.walkDecls((decl) => { assert.equal(decl.prop, 'transform'); });
    });
    assert.ok(!declarations.some((value) => value.startsWith('backdrop-filter:')));
    const media = css.nodes.find((node) => node.type === 'atrule' && node.name === 'media' && node.params === '(prefers-reduced-motion: reduce)');
    assert.ok(media);
    assert.match(media.toString(), /animation: none/);
    assert.match(media.toString(), /display: none/);
});
