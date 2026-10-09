import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ObjectId } from 'mongodb';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const tid = new ObjectId('1234567890abcdef12345678');
const dag = [
    { _id: 7, title: 'Basics', pids: [2, 1], requireNids: [] },
    { _id: 9, title: 'Advanced', pids: [3], requireNids: [7] },
];
function fixture() {
    const calls: any[] = [];
    const saved: any[] = [];
    const mocks: Record<string, any> = {
        '../service/server': { Handler: class {}, param: () => () => {}, post: () => () => {}, Types: { Range: () => [], ArrayOf: () => [] } },
        '../lib/list-sort': { LIST_SORT_MODES: ['default'] }, '@hydrooj/utils/lib/utils': {},
        '../model/builtin': { PERM: { PERM_EDIT_TRAINING: 1, PERM_EDIT_TRAINING_SELF: 2, PERM_CREATE_TRAINING: 3, PERM_VIEW_PROBLEM_HIDDEN: 4 } },
        '../error': { PermissionError: Error, ValidationError: Error, ProblemNotFoundError: Error },
        '../model/training': {
            get: async () => ({ docId: tid, dag }),
            getPids: (nodes: any[]) => [...new Set(nodes.flatMap((node) => node.pids))],
            edit: async (...args: any[]) => saved.push(args),
        },
        '../model/problem': { __esModule: true, default: {
            getList: async (...args: any[]) => { calls.push(args); return { 1: { docId: 1, pid: 'J0001', title: 'First' } }; },
            get: async (_domain: string, pid: number) => ({ docId: pid }),
        } },
    };
    const module = { exports: {} as any };
    const source = transformSync(readFileSync(new URL('../src/handler/training.ts', import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    runInNewContext(source, {
        module, exports: module.exports,
        require: (name: string) => mocks[name] ?? (name.startsWith('../') ? {} : require(name)),
    });
    const handler = new module.exports.TrainingEditHandler();
    const permissions: number[] = [];
    Object.assign(handler, {
        domain: { _id: 'team' }, user: { _id: 2, own: () => false, hasPerm: () => false }, response: {},
        checkPerm: (perm: number) => permissions.push(perm), url: () => '/d/team/training/1234567890abcdef12345678',
    });
    return { handler, calls, saved, permissions };
}

test('reopening an editable training returns scoped PID/title metadata without failing on missing problems', async () => {
    const { handler, calls, permissions } = fixture();
    await handler.prepare('team', tid);
    await handler.get();
    assert.equal(permissions[0], 1);
    assert.equal(calls[0][0], 'team');
    assert.equal(JSON.stringify(calls[0][1]), '[2,1,3]');
    assert.equal(calls[0][2], false);
    assert.equal(calls[0][3], false);
    assert.equal(JSON.stringify(calls[0][4]), '["docId","pid","title"]');
    assert.equal(calls[0][5], true);
    assert.equal(handler.response.body.pdict[1].title, 'First');
    assert.equal(JSON.stringify(JSON.parse(handler.response.body.dag)), JSON.stringify(dag));
});

test('training editing checks the active domain and keeps the existing owner/admin permission model', async () => {
    const { handler, permissions } = fixture();
    await assert.rejects(handler.prepare('other', tid));
    assert.equal(permissions.length, 0);
    handler.user.own = () => true;
    await handler.prepare('team', tid);
    assert.equal(permissions[0], 2);
    await handler.prepare('team', undefined);
    assert.equal(permissions[1], 3);
});

test('saving ordered problems and edited chapter IDs preserves every chapter and its prerequisites', async () => {
    const { handler, saved } = fixture();
    await handler.prepare('team', tid);
    await handler.post('team', tid, 'Updated training', 'Intro', JSON.stringify(dag), 0, 'Description');
    assert.equal(saved[0][0], 'team');
    assert.equal(saved[0][1], tid);
    assert.deepEqual(JSON.parse(JSON.stringify(saved[0][2].dag)), dag);
    assert.match(handler.response.redirect, /^\/d\/team\/training\//);
});
