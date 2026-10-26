import assert from 'node:assert/strict';
import { test } from 'node:test';
import { awaitPluginLoad, loadPluginEntries } from '../src/registry/plugin-loader.ts';

test('isolated addon loading preserves order and legacy plugins while reporting backend, import, setup and timeout failures', async () => {
    const installed: string[] = [];
    const failures: string[] = [];
    await loadPluginEntries([
        { name: 'first', load: async () => ({ setup() {} }) },
        { name: 'backend-failed', unavailable: true },
        { name: 'broken-import', load: async () => { throw new Error('Import failed'); } },
        { name: 'broken-setup', setup() { throw new Error('Setup failed'); } },
        { name: 'hung', load: () => new Promise(() => {}) },
        { name: 'legacy', setup() {} },
        { name: 'last', load: async () => ({ setup() {} }) },
    ], (plugin) => { plugin.setup({} as any); installed.push(plugin.name); }, (name) => failures.push(name), 10);
    assert.deepEqual(installed, ['first', 'legacy', 'last']);
    assert.deepEqual(failures.sort(), ['backend-failed', 'broken-import', 'broken-setup', 'hung']);
    await assert.rejects(awaitPluginLoad(() => new Promise(() => {}), 5), /timed out/);
});
