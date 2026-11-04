import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const { act, createElement: h } = require('react');
const { createRoot } = require('react-dom/client');

function loadHydroNotifications(notificationsData: any[] = [], onHide = (_id: string) => {}, onClean = () => {}) {
    const code = readFileSync(new URL('../src/components/feedback/hydro-notifications.tsx', import.meta.url), 'utf8');
    const compiled = transformSync(code, {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code;
    const result = { exports: {} as any };
    runInNewContext(compiled, {
        ...globalThis,
        setTimeout,
        clearTimeout,
        module: result,
        exports: result.exports,
        require: (id: string) => {
            if (id === '@/hooks/use-i18n') {
                return { useI18n: () => ({ t: (key: string) => key }) };
            }
            if (id === '@/components/common/button') {
                return {
                    ButtonBase: ({ children, className, ...props }: any) => h('button', { className, ...props }, children),
                };
            }
            if (id === '@/stores/notification') {
                return { useNotificationStore: (selector: any) => selector({ notifications: [], remove: () => {} }) };
            }
            if (id === '@mantine/notifications') {
                return {
                    notifications: { hide: onHide, clean: onClean, show: () => {} },
                    notificationsStore: {},
                    useNotifications: () => ({ notifications: notificationsData }),
                };
            }
            if (id === '@tabler/icons-react') {
                return {
                    IconAlertCircle: () => h('span', { 'data-testid': 'icon-alert-circle' }),
                    IconAlertTriangle: () => h('span', { 'data-testid': 'icon-alert-triangle' }),
                    IconCheck: () => h('span', { 'data-testid': 'icon-check' }),
                    IconInfoCircle: () => h('span', { 'data-testid': 'icon-info-circle' }),
                    IconX: () => h('span', { 'data-testid': 'icon-x' }),
                };
            }
            return require(id);
        },
    });
    return result.exports.HydroNotifications;
}

test('HydroNotifications renders nothing when list is empty', async () => {
    const HydroNotifications = loadHydroNotifications([]);
    const container = dom.window.document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
        root.render(h(HydroNotifications));
    });
    assert.equal(container.innerHTML, '');
    await act(async () => {
        root.unmount();
    });
});

test('HydroNotifications renders collapsed stack when multiple notifications exist and supports dismissal', async () => {
    const hidden: string[] = [];
    const testNotifs = [
        { id: '1', title: 'First (oldest)', message: 'First msg', color: 'blue', autoClose: false },
        { id: '2', title: 'Second', message: 'Second msg', color: 'green', autoClose: false },
        { id: '3', title: 'Third (newest)', message: 'Third msg', color: 'red', autoClose: false },
    ];
    const HydroNotifications = loadHydroNotifications(testNotifs, (id) => hidden.push(id));
    const container = dom.window.document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
        root.render(h(HydroNotifications));
    });

    const host = container.querySelector('.hydro-toast-container') as HTMLElement;
    assert.ok(host, 'Container exists');

    const cards = container.querySelectorAll('.hydro-toast-card');
    assert.equal(cards.length, 3, 'Renders all 3 cards in the stack');

    // Active front card is first-in notification
    assert.ok(cards[0].textContent?.includes('First (oldest)'), 'First notification is front card');
    assert.ok(cards[0].getAttribute('style')?.includes('scale(1)'), 'Front card has scale 1');

    // 2nd card has scale(0.96) stacked behind
    assert.ok(cards[1].getAttribute('style')?.includes('scale(0.96)'), '2nd card is scaled down behind');
    assert.ok(cards[1].textContent?.includes('Second'), '2nd card is second notification');

    // 3rd card has scale(0.92) stacked in the back
    assert.ok(cards[2].getAttribute('style')?.includes('scale(0.92)'), '3rd card is scaled down in back');
    assert.ok(cards[2].textContent?.includes('Third (newest)'), '3rd card is third notification');

    // Close button exists on front card only
    const closeBtn = cards[0].querySelector('.hydro-toast-close') as HTMLElement;
    assert.ok(closeBtn, 'Close button exists on front card');
    assert.equal(cards[1].querySelector('.hydro-toast-close'), null, 'No close button on background cards');

    // Clicking close button dismisses the front card
    await act(async () => {
        closeBtn.click();
    });

    // Wait for the 220ms dismiss animation timeout
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 260));
    });

    assert.deepEqual(hidden, ['1'], 'Front card id was passed to notifications.hide');

    await act(async () => {
        root.unmount();
    });
});

test('HydroNotifications auto-closes after timeout', async () => {
    const hidden: string[] = [];
    const testNotifs = [
        { id: 'test-auto', title: 'Auto close test', message: 'Will disappear', color: 'green', autoClose: 50 },
    ];
    const HydroNotifications = loadHydroNotifications(testNotifs, (id) => hidden.push(id));
    const container = dom.window.document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
        root.render(h(HydroNotifications));
    });

    // Wait for autoClose (50ms) + dismiss delay (200ms)
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 320));
    });

    assert.deepEqual(hidden, ['test-auto'], 'Auto-close timer invoked notifications.hide');

    await act(async () => {
        root.unmount();
    });
});

test('HydroNotifications styles enforce no box-shadow, no dots, and smooth transitions', () => {
    const css = readFileSync(new URL('../src/styles/tailwind.css', import.meta.url), 'utf8');
    const parsed = postcss.parse(css);

    let foundCard = false;
    let foundContainer = false;

    parsed.walkRules((rule) => {
        if (rule.selector === '.hydro-toast-card') {
            foundCard = true;
            rule.walkDecls('box-shadow', (decl) => {
                assert.ok(decl.value.includes('none'), '.hydro-toast-card must have box-shadow: none');
            });
            rule.walkDecls('align-items', (decl) => {
                assert.equal(decl.value, 'center', '.hydro-toast-card must have align-items: center for vertical center alignment');
            });
            rule.walkDecls('animation', (decl) => {
                assert.ok(decl.value.includes('hydro-toast-slide-down'), '.hydro-toast-card has slide-down enter animation');
            });
        }
        if (rule.selector === '.hydro-toast-container') {
            foundContainer = true;
            assert.ok(!rule.nodes?.some((n: any) => n.prop === 'box-shadow' && !n.value.includes('none')));
        }
    });

    assert.ok(foundCard, '.hydro-toast-card CSS rule found');
    assert.ok(foundContainer, '.hydro-toast-container CSS rule found');

    // Ensure no toast rules contain breathing or glowing animations
    parsed.walkRules((rule) => {
        if (rule.selector.startsWith('.hydro-toast')) {
            rule.walkDecls('animation', (decl) => {
                assert.ok(!decl.value.includes('breathe') && !decl.value.includes('pulse'), 'No breathing animation on toasts');
            });
            rule.walkDecls('box-shadow', (decl) => {
                assert.ok(decl.value.includes('none'), 'Toast elements must have box-shadow: none');
            });
        }
    });
});
