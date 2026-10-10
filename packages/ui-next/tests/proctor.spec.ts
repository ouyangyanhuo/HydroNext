import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proctorAccessHeaders, proctorAccessRequest, proctorError, proctorRequest, proctorSubmissionHeaders } from '../src/utils/proctor.ts';

const payload = { pid: 42, lang: 'cc.cc20', code: 'int main(){}', pretest: false, input: [], fileHash: '' };
function withWindow(value: unknown, run: () => Promise<void>) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value, configurable: true });
    return run().finally(() => {
        if (previous) Object.defineProperty(globalThis, 'window', previous);
        else Reflect.deleteProperty(globalThis, 'window');
    });
}

test('ordinary contests keep existing submission behavior without requiring a client bridge', async () => {
    await withWindow({}, async () => {
        assert.deepEqual(await proctorSubmissionHeaders(false, '/p/42/submit', payload), {});
    });
});

test('content reads bind the full domain path, contest and display PID; unrelated and cross-origin URLs are not signed', async () => {
    const tid = '1234567890abcdef12345678';
    const origin = 'https://oj.example';
    assert.deepEqual(proctorAccessRequest(`/d/exam/p/J0002?tid=${tid}`, origin), {
        action: 'problem_view', method: 'GET', path: '/d/exam/p/J0002', payload: { tid, pid: 'J0002' },
    });
    assert.equal(proctorAccessRequest(`/p/001?tid=${tid}`, origin)?.payload.pid, '1');
    assert.deepEqual(proctorAccessRequest(`/d/exam/contest/${tid}/problems`, origin)?.payload, { tid });
    assert.equal(proctorAccessRequest(`/p/J0002/file/statement.pdf?tid=${tid}`, origin)?.action, 'problem_view');
    assert.equal(proctorAccessRequest(`/contest/${tid}/file/private/statement.pdf`, origin)?.action, 'contest_view');
    for (const url of ['/p/1', '/p/1?tid=invalid', `/p/1?tid=${tid}&tid=${tid}`, `/contest/${tid}`, '/proctor/identity',
        `/contest/${tid}/file/public/rules.pdf`, `https://evil.example/p/1?tid=${tid}`]) {
        assert.equal(proctorAccessRequest(url, origin), null);
    }
});

test('read bridge forwards only authentication headers and never signs untrusted origins', async () => {
    const tid = '1234567890abcdef12345678';
    const calls: any[] = [];
    await withWindow({ location: { origin: 'https://oj.example' }, examAPI: { proctorHeaders: async (request: any) => {
        calls.push(request);
        return { 'x-proctor-token': 'token', 'x-proctor-proof': 'proof', authorization: 'not-forwarded' };
    } } }, async () => {
        assert.deepEqual(await proctorAccessHeaders(`/p/1?tid=${tid}`), { 'x-proctor-token': 'token', 'x-proctor-proof': 'proof' });
        assert.deepEqual(await proctorAccessHeaders(`https://evil.example/p/1?tid=${tid}`), {});
        assert.equal(calls.length, 1);
        assert.equal(calls[0].method, 'GET');
    });
    await withWindow({ location: { origin: 'https://oj.example' } }, async () => {
        assert.deepEqual(await proctorAccessHeaders(`/p/1?tid=${tid}`), {});
    });
    await withWindow({ location: { origin: 'https://oj.example' }, examAPI: { proctorHeaders: async () => ({ token: 'wrong' }) } }, async () => {
        await assert.rejects(proctorAccessHeaders(`/p/1?tid=${tid}`), /Proctor authentication required/);
    });
});

test('proctored contests fail closed when client authentication is missing or malformed', async () => {
    await withWindow({ location: { origin: 'https://oj.example' } }, async () => {
        await assert.rejects(proctorSubmissionHeaders(true, '/p/42/submit', payload));
    });
    await withWindow({ location: { origin: 'https://oj.example' }, examAPI: { proctorHeaders: async () => ({ token: 'wrong' }) } }, async () => {
        await assert.rejects(proctorSubmissionHeaders(true, '/p/42/submit', payload));
    });
});

test('client signing bridge receives canonical numeric PID, full domain path and exact code; cross-origin targets are rejected', async () => {
    const calls: any[] = [];
    await withWindow({ location: { origin: 'https://oj.example' }, examAPI: { proctorHeaders: async (request: any) => {
        calls.push(request);
        return { 'x-proctor-token': 'token', 'x-proctor-proof': 'proof', authorization: 'must-not-forward' };
    } } }, async () => {
        assert.deepEqual(await proctorSubmissionHeaders(true, '/d/exam/p/J0002/submit?tid=contest', payload), {
            'x-proctor-token': 'token', 'x-proctor-proof': 'proof',
        });
        assert.deepEqual(calls[0], { action: 'submit', method: 'POST', path: '/d/exam/p/J0002/submit', payload });
        await assert.rejects(proctorSubmissionHeaders(true, 'https://evil.example/p/42/submit', payload));
        assert.equal(calls.length, 1);
    });
});

test('authentication errors preserve meaningful reasons and substitute other error parameters', () => {
    assert.equal(proctorError({ name: 'ForbiddenError', message: 'ForbiddenError', params: ['Proctor client version mismatch.'] }),
        'Proctor client version mismatch.');
    assert.equal(proctorError({ name: 'PrivilegeError', message: 'Missing privilege {0}', params: [1] }), 'Missing privilege 1');
});

test('admin requests follow Hydro sudo url responses instead of reporting a successful save', async () => {
    const original = globalThis.fetch;
    const destinations: string[] = [];
    try {
        await withWindow({ location: { origin: 'https://oj.example', assign: (url: string) => destinations.push(url) } }, async () => {
            for (const field of ['url', 'redirect']) {
                globalThis.fetch = (async () => ({ ok: true, json: async () => ({ [field]: '/d/exam/user/sudo' }) })) as any;
                // eslint-disable-next-line no-await-in-loop
                await assert.rejects(proctorRequest('/d/exam/manage/proctor', { operation: 'save', enabled: true }), /Authorization required/);
            }
            assert.deepEqual(destinations, ['https://oj.example/d/exam/user/sudo', 'https://oj.example/d/exam/user/sudo']);
            globalThis.fetch = (async () => ({ ok: true, json: async () => ({ ok: true, config: { enabled: true } }) })) as any;
            assert.deepEqual(await proctorRequest('/manage/proctor', { operation: 'save' }), { ok: true, config: { enabled: true } });
        });
    } finally { globalThis.fetch = original; }
});

test('admin requests never follow unsafe authorization destinations or redirects in failed responses', async () => {
    const original = globalThis.fetch;
    let navigations = 0;
    try {
        await withWindow({ location: { origin: 'https://oj.example', assign: () => navigations++ } }, async () => {
            const unsafe = ['https://evil.example/sudo', '//evil.example/sudo', 'javascript:alert(1)', '/\\evil.example/sudo', { path: '/sudo' }];
            for (const url of unsafe) {
                globalThis.fetch = (async () => ({ ok: true, json: async () => ({ url }) })) as any;
                // eslint-disable-next-line no-await-in-loop
                await assert.rejects(proctorRequest('/manage/proctor', {}), /Invalid authorization destination/);
            }
            globalThis.fetch = (async () => ({ ok: false, json: async () => ({ url: '/sudo', error: {
                name: 'ForbiddenError', message: 'ForbiddenError', params: ['Generate authentication keys first.'],
            } }) })) as any;
            await assert.rejects(proctorRequest('/manage/proctor', {}), /Generate authentication keys first/);
            assert.equal(navigations, 0);
        });
    } finally { globalThis.fetch = original; }
});
