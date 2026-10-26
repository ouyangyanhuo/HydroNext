import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, any>) {
    const module = { exports: {} as any };
    runInNewContext(transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        loader: path.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic',
    }).code, { module, exports: module.exports, require: (name: string) => mocks[name] || require(name) });
    return module.exports;
}

test('message menu uses the domain-aware link, respects visibility and login, and closes the mobile drawer', () => {
    let loggedIn = true;
    const ui: Record<string, boolean> = { privateMessagesEntryVisible: true };
    const MenuItem = () => null;
    const Button = () => null;
    const { MessagesMenuEntry } = load('../ui/menu-entry.tsx', {
        '@hydrooj/ui-next': {
            Button, Link: () => null, PRIV: { PRIV_USER_PROFILE: 4 }, useHasPriv: () => loggedIn,
            useI18n: () => ({ t: (key: string) => key }), useSessionStore: (select: any) => select({ ui }),
        },
        '@mantine/core': { Menu: { Item: MenuItem } },
        '@tabler/icons-react': { IconMessages: () => null },
    });
    const desktop = MessagesMenuEntry({ variant: 'menu' });
    assert.equal(desktop.type, MenuItem);
    assert.equal(desktop.props.to, 'home_messages');
    assert.equal(desktop.props.children, 'Messages');
    let closed = false;
    const mobile = MessagesMenuEntry({ variant: 'mobile', onClose: () => { closed = true; } });
    assert.equal(mobile.type, Button);
    assert.equal(mobile.props.to, 'home_messages');
    mobile.props.onClick();
    assert.equal(closed, true);
    delete ui.privateMessagesEntryVisible;
    assert.equal(MessagesMenuEntry({}), null);
    ui.privateMessagesEntryVisible = false;
    assert.equal(MessagesMenuEntry({}), null);
    ui.privateMessagesEntryVisible = true;
    loggedIn = false;
    assert.equal(MessagesMenuEntry({}), null);
});

test('private message visibility is a default-on system setting and never removes the direct route', () => {
    let configured: boolean | undefined;
    let registered = 0;
    const settings: any[] = [];
    const hooks: Record<string, any> = {};
    const { apply } = load('../index.ts', {
        hydrooj: { SettingModel: { Setting: (...args: any[]) => args }, SystemModel: { get: () => configured } },
        './handler': { apply: () => { registered++; } },
    });
    apply({ setting: { SystemSetting: (setting: any) => settings.push(setting) },
        on: (event: string, handler: any) => { hooks[event] = handler; } });
    assert.equal(settings[0][1], 'private-messages.showEntry');
    assert.equal(settings[0][2], true);
    const handler = { UiContext: {} as any };
    hooks['handler/after'](handler);
    assert.equal(handler.UiContext.privateMessagesEntryVisible, true);
    configured = false;
    hooks['handler/after'](handler);
    assert.equal(handler.UiContext.privateMessagesEntryVisible, false);
    assert.equal(registered, 1);
});
