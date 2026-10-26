import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { createEditorAddon, registerEditorAddon } from '../../ui-next/src/components/editor/addons.ts';
import {
    registerProtectedAccessResolver as registerProctorAccessResolver,
    resolveProtectedAccess } from '../../ui-next/src/registry/request-security.ts';
import { replayAccessRequest } from '../ui/access.ts';

const proctorAccessRequest = (value: string, origin: string) => {
    const url = new URL(value, origin);
    return url.origin === origin ? resolveProtectedAccess(url) : null;
};

test('optional recorder and protected replay routes are absent until registered and disappear on disposal', async () => {
    const context = { userId: 1, domainId: 'exam', pid: 'P1', submitPid: 1, ui: {}, translate: (key: string) => key };
    assert.equal(createEditorAddon(context), null);
    const url = '/d/exam/record/abcdef1234567890abcdef12/replay/data';
    const origin = 'https://oj.example';
    assert.equal(proctorAccessRequest(url, origin), null);
    const disposeAccess = registerProctorAccessResolver(replayAccessRequest);
    let committed = false;
    const disposeRecorder = registerEditorAddon('test-recorder', () => ({
        initialize: async (code) => code,
        capture() {}, action() {}, change() {},
        beforeSubmit: async () => ({ fields: { checkpoint: 'saved' }, complete: async () => { committed = true; } }),
    }));
    try {
        assert.deepEqual(proctorAccessRequest(url, origin), {
            action: 'record_view', method: 'GET', path: url, payload: { rid: 'abcdef1234567890abcdef12' },
        });
        assert.equal(proctorAccessRequest(`https://untrusted.example${url}`, origin), null);
        const recorder = createEditorAddon(context)!;
        assert.equal(await recorder.initialize('source'), 'source');
        const receipt = await recorder.beforeSubmit('source', 'cc');
        assert.deepEqual(receipt.fields, { checkpoint: 'saved' });
        assert.equal(committed, false);
        await receipt.complete({});
        assert.equal(committed, true);
    } finally {
        disposeRecorder();
        disposeAccess();
    }
    assert.equal(createEditorAddon(context), null);
    assert.equal(proctorAccessRequest(url, origin), null);
});

test('an outgoing editor cannot publish a restored recording after its initialization is cancelled', async () => {
    let resolve!: (value: any) => void;
    let saved = 0;
    const mocks = {
        '@mantine/notifications': { notifications: { show() {} } },
        '../replay': { REPLAY_ACTIONS: ['template', 'paste', 'self_test', 'submit'] },
        './components/editor/replay-recording': {},
        './components/editor/replay-storage': {
            replayDraftKey: (key: string) => key,
            restoreRecording: () => new Promise((complete) => { resolve = complete; }),
            persistRecording: async () => { saved++; },
        },
    };
    const module = { exports: {} as any };
    const source = readFileSync(new URL('../ui/recorder.ts', import.meta.url), 'utf8');
    runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, require: (name: string) => {
            assert.ok(mocks[name], `Unexpected dependency: ${name}`);
            return mocks[name];
        },
    });
    const recorder = module.exports.createRecorder({
        userId: 1, domainId: 'exam', pid: 'P1', ui: { editorAddons: { 'code-replay': { sessionUrl: '/code-replay/session' } } },
    });
    const controller = new AbortController();
    const pending = recorder.initialize('current', controller.signal);
    controller.abort();
    resolve({ currentCode: 'outgoing draft' });
    assert.equal(await pending, 'current');
    assert.equal(saved, 0);
});
