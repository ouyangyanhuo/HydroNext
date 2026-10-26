import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import * as config from '../config.ts';

const require = createRequire(import.meta.url);
test('administrator paste settings default to 30, accept -1/0, and reject malformed or unsafe values before saving', () => {
    const hooks: Record<string, any> = {};
    const settings: any[] = [];
    let value: unknown;
    const module = { exports: {} as any };
    const api = { SettingModel: { Setting: (...args: any[]) => args }, SystemModel: { get: () => value }, ValidationError: Error };
    runInNewContext(transformSync(readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, require: (name: string) => name === 'hydrooj' ? api : config,
    });
    module.exports.apply({ setting: { SystemSetting: (setting: any) => settings.push(setting) },
        on: (name: string, callback: any) => { hooks[name] = callback; } });
    assert.equal(settings[0][0], 'setting_code_paste');
    assert.equal(settings[0][1], config.PASTE_LIMIT_KEY);
    assert.equal(settings[0][2], 30);
    const handler: any = { args: {}, UiContext: {} };
    hooks['handler/after'](handler);
    assert.equal(handler.UiContext.editorPasteLimit, 30);
    for (value of [-1, 0, 7, 30]) {
        handler.args = { 'editor-paste-guard': { maxLength: value } };
        hooks['handler/before/SystemSetting#post'](handler);
        hooks['handler/after'](handler);
        assert.equal(handler.UiContext.editorPasteLimit, value);
    }
    for (const invalid of [-2, 1.5, '', '1e2', true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        handler.args = { 'editor-paste-guard': { maxLength: invalid } };
        assert.throws(() => hooks['handler/before/SystemSetting#post'](handler));
    }
});

test('the full-width paste feature card toggles -1, preserves 0, and hides its input when disabled', () => {
    const saved: any[] = [];
    const module = { exports: {} as any };
    runInNewContext(transformSync(readFileSync(new URL('../ui/settings.tsx', import.meta.url), 'utf8'), {
        loader: 'tsx', format: 'cjs', jsx: 'automatic',
    }).code, { module, exports: module.exports, require: (name: string) => {
        if (name === '@hydrooj/ui-next') return { useI18n: () => ({ t: (text: string) => text }) };
        if (name === '@mantine/core') return { Text: 'span', Switch: 'switch', NumberInput: 'number' };
        if (name === '@tabler/icons-react') return { IconClipboard: 'svg' };
        if (name === 'react') return { useState: () => [0, () => {}] };
        return name === '../config' ? config : require(name);
    } });
    const props = { setting: { key: config.PASTE_LIMIT_KEY }, value: 0, onChange: (next: any) => saved.push(next), children: null };
    const view = module.exports.PasteLimitSetting(props);
    assert.equal(view.props.className, 'hydro-feature-setting-row');
    const control = view.props.children[0].props.children;
    assert.equal(control.props['aria-checked'], true);
    assert.match(view.props.children[0].props.className, /--half/);
    assert.equal(view.props.children[1].props.children.props.value, 0);
    control.props.onClick();
    const disabled = module.exports.PasteLimitSetting({ ...props, value: -1 });
    assert.match(disabled.props.children[0].props.className, /--full/);
    assert.equal(disabled.props.children[1], false);
    let prevented = false;
    disabled.props.children[0].props.children.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.deepEqual(saved, [-1, 0]);
    const locked = module.exports.PasteLimitSetting({ ...props, setting: { ...props.setting, flag: 2 } });
    locked.props.children[0].props.children.props.onClick();
    assert.equal(saved.length, 2);
    assert.equal(module.exports.PasteLimitSetting({ ...props, setting: { key: 'other' }, children: 'Original input' }), 'Original input');
});
