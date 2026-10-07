import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/handler/user.ts', import.meta.url), 'utf8');
async function handler(method: string) {
    const module = { exports: {} as any };
    const mocks = {
        '../error': { ForbiddenError: Error, ValidationError: Error },
        '../model/oplog': { log: async () => {} },
        '../model/builtin': { PRIV: {}, PERM: {}, STATUS: {} },
        '../model/system': { get: () => false },
        '../service/server': { Handler: class {}, Types: {}, param: () => () => {}, Query: () => ({}) },
    };
    const code = transformSync(source, { loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    runInNewContext(code, { module, exports: module.exports, Buffer,
        require: (name: string) => mocks[name] ?? (name.startsWith('.') ? {} : require(name)) });
    let handlerClass: any;
    await module.exports.apply({ Route: (name: string, _url: string, value: any) => { if (name === 'user_sudo') handlerClass = value; },
        oauth: { provide() {} }, inject: async () => {} });
    const instance = Reflect.construct(handlerClass, []);
    instance.session = { sudoArgs: { method, redirect: '/d/team/home/security?page=2', args: { operation: 'delete', id: 'key' } } };
    instance.user = { checkPassword: async (password: string) => { if (password !== 'valid') throw new Error('Invalid password'); } };
    instance.limitRate = async () => {};
    instance.response = {};
    return instance;
}

test('sudo GET exposes the captured target and successful verification preserves it', async () => {
    const instance = await handler('get');
    await instance.get();
    assert.equal(instance.response.body.redirect, '/d/team/home/security?page=2');
    await instance.post('team', 'valid');
    assert.equal(instance.response.redirect, '/d/team/home/security?page=2');
    assert.equal(instance.session.sudoArgs.method, null);
});

test('sudo mutation response retains its method and payload after the session replay marker is cleared', async () => {
    const instance = await handler('post');
    await instance.post('team', 'valid');
    assert.equal(instance.session.sudoArgs.method, null);
    assert.equal(instance.response.body.method, 'post');
    assert.equal(instance.response.body.args.operation, 'delete');
    assert.equal(instance.response.body.redirect, '/d/team/home/security?page=2');
});

test('unsuccessful sudo verification does not consume the target or authorize a replay', async () => {
    const instance = await handler('post');
    await assert.rejects(instance.post('team', 'invalid'), /Invalid password/);
    assert.equal(instance.session.sudo, undefined);
    assert.equal(instance.session.sudoArgs.method, 'post');
    assert.equal(instance.response.body, undefined);
});
