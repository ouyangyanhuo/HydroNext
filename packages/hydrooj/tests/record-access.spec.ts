import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const built = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/lib/record-access.ts', import.meta.url))],
    bundle: true, write: false, format: 'cjs', platform: 'node',
    external: ['../error', '../model/builtin', '../model/contest', '../model/problem'],
});

function fixture(options: any = {}) {
    const PERM = Object.fromEntries(['VIEW_RECORD', 'READ_RECORD_CODE', 'READ_RECORD_CODE_ACCEPT', 'VIEW_PROBLEM_HIDDEN']
        .map((key) => [`PERM_${key}`, key]));
    const user = {
        _id: options.owner ? 1 : 2,
        hasPerm: (permission: string) => (options.permissions || ['VIEW_RECORD']).includes(permission),
        hasPriv: () => !!options.global,
        own: () => !!options.contestOwner,
    };
    const stubs: any = {
        '../error': { PermissionError: Error, ContestNotFoundError: Error },
        '../model/builtin': { PERM, PRIV: { PRIV_READ_RECORD_CODE: 'global' }, STATUS: { STATUS_ACCEPTED: 1 } },
        '../model/contest': {
            get: async () => (options.deletedContest ? null : { docId: 'contest', allowViewCode: options.allowViewCode }),
            getStatus: async () => ({ attend: options.attend }),
            canShowRecord: () => !!options.showRecord, canShowSelfRecord: () => !!options.showSelf,
            isDone: () => !!options.done,
        },
        '../model/problem': {
            PROJECTION_LIST: [], get: async () => ({ docId: 1, hidden: options.hidden }),
            getStatus: async () => ({ status: options.accepted ? 1 : 0 }),
            canViewBy: () => !options.hidden || user.hasPerm('VIEW_PROBLEM_HIDDEN'),
        },
    };
    const module = { exports: {} as any };
    runInNewContext(built.outputFiles[0].text, {
        module, exports: module.exports, require: (name: string) => stubs[name] || require(name),
    });
    const record = { _id: 'rid', uid: 1, domainId: 'team', pid: 1, contest: options.contest };
    return () => module.exports.getRecordAccess({ user }, record);
}

test('code privileges, accepted status and ownership cannot bypass hidden problem visibility', async () => {
    await Promise.all([
        { permissions: ['VIEW_RECORD', 'READ_RECORD_CODE'] }, { global: true },
        { permissions: ['VIEW_RECORD', 'READ_RECORD_CODE_ACCEPT'], accepted: true }, { owner: true },
    ].map((extra) => assert.rejects(fixture({ hidden: true, ...extra })(), /VIEW_PROBLEM_HIDDEN/)));
});

test('visible problems preserve owner, domain, global and accepted-code permissions', async () => {
    await Promise.all([
        { permissions: ['VIEW_RECORD', 'READ_RECORD_CODE'] }, { global: true },
        { permissions: ['VIEW_RECORD', 'READ_RECORD_CODE_ACCEPT'], accepted: true }, { owner: true },
        { hidden: true, permissions: ['VIEW_RECORD', 'VIEW_PROBLEM_HIDDEN', 'READ_RECORD_CODE'] },
    ].map(async (extra) => assert.equal((await fixture(extra)()).canViewCode, true)));
    assert.equal((await fixture()()).canViewCode, false);
    assert.equal((await fixture({ permissions: ['VIEW_RECORD', 'READ_RECORD_CODE_ACCEPT'] })()).canViewCode, false);
});

test('contest restrictions remain mandatory and participants retain allowed hidden-problem access', async () => {
    await assert.rejects(fixture({ contest: 'contest', global: true })());
    await assert.rejects(fixture({ contest: 'contest', hidden: true, showRecord: true, global: true })(), /VIEW_PROBLEM_HIDDEN/);
    assert.equal((await fixture({ contest: 'contest', hidden: true, showRecord: true, attend: true, global: true })()).canViewCode, true);
    assert.equal((await fixture({ contest: 'contest', showRecord: true, attend: true, done: true, allowViewCode: true })()).canViewCode, true);
    const own = await fixture({ owner: true, contest: 'contest', hidden: true, attend: true })();
    assert.equal(own.canViewDetail, false);
    assert.equal(own.canViewCode, true);
});

test('nonowners still need record visibility and cannot read another users pretest', async () => {
    await assert.rejects(fixture({ permissions: [], global: true })(), /VIEW_RECORD/);
    await assert.rejects(fixture({ contest: `${'0'.repeat(23)}1`, global: true })(), /READ_RECORD_CODE/);
    await assert.rejects(fixture({ contest: 'contest', deletedContest: true })());
});
