import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

test('private messages preserve domain identity and only their sender can delete them', async () => {
    const calls: any[] = [];
    const module = { exports: {} as any };
    const api = {
        Handler: class {}, param: () => () => {}, Types: {}, PRIV: { PRIV_SEND_MESSAGE: 8 },
        PermissionError: Error, UserNotFoundError: Error, avatar: (value: string) => value,
        UserModel: { getById: async (domainId: string, uid: number) => {
            calls.push(['user', domainId, uid]);
            return { _id: uid, uname: 'user', displayName: 'Domain name' };
        } },
        MessageModel: {
            FLAG_UNREAD: 1,
            send: async (...args: any[]) => { calls.push(['send', ...args]); return { _id: 'message' }; },
            get: async () => ({ from: 2 }),
            del: async (id: string) => calls.push(['delete', id]),
        },
    };
    runInNewContext(transformSync(readFileSync(new URL('../handler.ts', import.meta.url), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, require: (name: string) => {
        assert.equal(name, 'hydrooj');
        return api;
    } });
    const handler = new module.exports.HomeMessagesHandler();
    handler.user = { _id: 2 };
    handler.checkPriv = (priv: number) => { assert.equal(priv, 8); };
    handler.back = () => {};
    await handler.postSend('exam', 3, 'hello');
    assert.deepEqual(calls, [['user', 'exam', 3], ['send', 2, 3, 'hello', 1]]);
    await handler.postDeleteMessage({}, 'message');
    handler.user._id = 3;
    await assert.rejects(handler.postDeleteMessage({}, 'message'));
    handler.checkPriv = () => { throw new Error('forbidden'); };
    await assert.rejects(handler.postSend('exam', 3, 'blocked'));
    assert.equal(calls.length, 3);
});
