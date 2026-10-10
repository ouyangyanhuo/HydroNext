import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proctorError, proctorSubmissionHeaders } from '../src/utils/proctor.ts';

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
    assert.equal(proctorError({ name: 'ForbiddenError', message: 'Forbidden: {0}', params: ['Proctor client version mismatch.'] }),
        'Proctor client version mismatch.');
    assert.equal(proctorError({ name: 'PrivilegeError', message: 'Missing privilege {0}', params: [1] }), 'Missing privilege 1');
});
