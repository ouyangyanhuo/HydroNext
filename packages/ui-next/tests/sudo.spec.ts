import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { proctorError } from '../src/utils/proctor.ts';

const module = { exports: {} as any };
const code = transformSync(readFileSync(new URL('../src/utils/sudo.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
runInNewContext(code, { module, exports: module.exports, URL, fetch,
    require: () => ({ proctorError }) });
const { completeSudoVerification } = module.exports;

const current = 'https://oj.example/d/team/user/sudo';
const target = '/d/team/home/security?tab=authn&page=2';

test('authorization follows the server url and preserves the domain, query and target', async () => {
    assert.equal(await completeSudoVerification({ url: target }, '/d/team/', current), target);
    assert.equal(await completeSudoVerification({ redirect: target }, undefined, current), target);
    assert.equal(await completeSudoVerification({}, target, current), target);
});

test('authorization resumes a saved mutation once and follows its resulting redirect', async () => {
    const calls: any[] = [];
    const request: any = async (url: string, init: RequestInit) => {
        calls.push([url, init]);
        return { ok: true, headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ url: '/d/team/home/security?done=1' }) };
    };
    const destination = await completeSudoVerification({ redirect: target, method: 'post', args: { operation: 'delete', id: 'frame' } },
        undefined, current, request);
    assert.equal(destination, '/d/team/home/security?done=1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], target);
    assert.equal(calls[0][1].method, 'POST');
    assert.deepEqual(JSON.parse(calls[0][1].body), { operation: 'delete', id: 'frame' });
});

test('proctor settings replay preserves boolean and numeric JSON types and returns to the originating settings page', async () => {
    const config = { operation: 'save', enabled: true, refreshEnabled: false, requiredVersion: '1.0.0',
        tokenTtlSeconds: 300, uploadGraceDays: 30, maxLogMiB: 64 };
    let submitted: any;
    const request: any = async (url: string, init: RequestInit) => {
        assert.equal(url, '/d/team/manage/proctor');
        submitted = JSON.parse(String(init.body));
        return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ok: true, config }) };
    };
    const destination = await completeSudoVerification({ redirect: '/d/team/manage/proctor', method: 'post', args: config,
        referer: '/d/team/manage/proctor?page=2' }, undefined, current, request);
    assert.deepEqual(submitted, config);
    assert.equal(destination, '/d/team/manage/proctor?page=2');
});

test('failed saved operations surface the error rather than navigating to the home page', async () => {
    const request: any = async () => ({ ok: false, headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: { message: 'Permission {0} required', params: ['admin'] } }) });
    await assert.rejects(completeSudoVerification({ redirect: target, method: 'post', args: {} }, undefined, current, request),
        /Permission admin required/);
    const missingKeys: any = async () => ({ ok: false, headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: { name: 'ForbiddenError', message: 'ForbiddenError', params: ['Generate authentication keys first.'] } }) });
    await assert.rejects(completeSudoVerification({ redirect: target, method: 'post', args: {} }, undefined, current, missingKeys),
        /Generate authentication keys first/);
});

test('authorization cannot redirect or replay a mutation to another origin or script URL', async () => {
    let writes = 0;
    const request: any = async () => { writes++; };
    await Promise.all(['https://evil.example/', '//evil.example/', 'javascript:alert(1)', '/\\evil.example/', undefined]
        .map((redirect) => assert.rejects(completeSudoVerification({ redirect, method: 'post' }, undefined, current, request))));
    assert.equal(writes, 0);
});
