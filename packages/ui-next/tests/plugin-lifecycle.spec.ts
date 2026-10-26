import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('failed plugin setup rolls back public registrations and restores overrides without touching healthy plugins', async () => {
    const directory = fileURLToPath(new URL('../src/', import.meta.url));
    const built = await build({
        stdin: { contents: [
            "export { installPlugin } from './registry/plugin';",
            "export { store } from './registry/store';",
            "export * from './registry/manage-entries'; export * from './registry/user-fields';",
            "export * from './registry/request-security'; export * from './components/editor/addons';",
        ].join('\n'), resolveDir: directory },
        bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent',
        plugins: [{ name: 'test-layout', setup(builder) {
            builder.onResolve({ filter: /(?:error-boundary|components\/layout)$/ }, () => ({ path: 'empty', namespace: 'fixture' }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
                contents: 'export default function Layout() { return null; } export const SlotErrorBoundary = Layout;',
            }));
        } }],
    });
    const module = { exports: {} as any };
    runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require, console });
    const api = module.exports;
    const old = () => null;
    const disposeOld = api.installPlugin({ name: 'healthy', setup(plugin: any) {
        plugin.after('component:test', old, { id: 'stable' });
        plugin.registerPage('test', async () => ({ default: old }), { title: 'Healthy' });
        plugin.registerLayout('test', old);
    } });
    const page = api.store.getDefault('page:test');
    const layout = api.store.getDefault('layout:test');
    assert.throws(() => api.installPlugin({ name: 'broken', setup(plugin: any) {
        plugin.after('component:test', () => null, { id: 'stable' });
        plugin.registerPage('test', async () => ({ default: old }), { title: 'Broken' });
        plugin.registerLayout('test', () => null);
        api.registerUserFields(['brokenField']);
        api.registerEditorAddon('broken', () => ({}));
        api.registerManageEntry({ to: 'broken', title: 'Broken' });
        api.registerRequestSecurity({ accessHeaders() {}, submissionHeaders() {}, canRetry() {} });
        api.registerProtectedAccessResolver((target: URL) => ({ method: 'GET', path: target.pathname }));
        throw new Error('Intentional failure');
    } }), /Intentional failure/);
    assert.equal(api.store.getDefault('page:test'), page);
    assert.equal(api.store.getDefault('layout:test'), layout);
    assert.equal(api.store.getPageMetadata('test').title, 'Healthy');
    assert.equal(api.store.getInterceptors('component:test').length, 1);
    assert.equal(api.getUserExtensionFields().length, 0);
    assert.equal(api.createEditorAddon({}), null);
    assert.equal(api.resolveProtectedAccess(new URL('https://oj.example/test')), null);
    await assert.rejects(api.protectedSubmissionHeaders(true, '/test', {}), /unavailable/);
    api.registerManageEntry({ to: 'broken', title: 'Recovered' })();
    let cleanups = 0;
    const dispose = api.installPlugin({ name: 'cleanup', setup() {
        return () => { cleanups++; };
    } });
    dispose();
    dispose();
    assert.equal(cleanups, 1);
    disposeOld();
    assert.equal(api.store.getDefault('page:test'), undefined);
});
