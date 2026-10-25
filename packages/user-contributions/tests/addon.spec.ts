import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

test('contribution queries run only for valid profiles and a statistics failure does not break the profile', async () => {
    const queries: number[] = [];
    const warnings: any[] = [];
    let hook: (handler: any, uid: any, data: any) => Promise<void>;
    let fail = false;
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    const module = { exports: {} as any };
    runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports,
        require: (name: string) => {
            assert.equal(name, './model');
            return { getUserContributions: async (uid: number) => {
                queries.push(uid);
                if (fail) throw new Error('database unavailable');
                return { days: [{ date: '2026-10-25', count: 2 }], summary: { total: 2 } };
            } };
        },
    });
    module.exports.apply({
        logger: () => ({ warn: (...args: any[]) => warnings.push(args) }),
        on: (name: string, callback: any) => { assert.equal(name, 'user/profile'); hook = callback; },
    });
    assert.equal(queries.length, 0, 'Installing the addon must not scan records.');
    for (const uid of [undefined, 0, -1000, '3']) {
        // eslint-disable-next-line no-await-in-loop
        await hook({}, uid, {});
    }
    assert.equal(queries.length, 0);
    const data: any = {};
    await hook({}, 3, data);
    assert.deepEqual(queries, [3]);
    assert.equal(data.contributions.summary.total, 2);
    fail = true;
    const failed: any = {};
    await hook({}, 4, failed);
    assert.equal(failed.contributions, undefined);
    assert.equal(warnings.length, 1);
});
