import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { test } from 'node:test';
import { assertRequestOrigin, isAllowedRequestOrigin, requestTargetOrigin } from '../request-origin.ts';

const target = 'https://oj.example';

test('unsafe requests use exact Origin first, then Referer, including opaque and mismatched sources', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        assert.doesNotThrow(() => assertRequestOrigin({ method, target, headers: { origin: target } }));
        assert.doesNotThrow(() => assertRequestOrigin({ method, target, headers: { referer: `${target}/d/team/p/1` } }));
        for (const origin of ['https://evil.example', 'http://oj.example', 'https://oj.example:8443',
            'https://oj.example.evil.example', 'null', '', 'https://oj.example/forged/path']) {
            assert.throws(() => assertRequestOrigin({ method, target, headers: {
                origin, referer: `${target}/`, 'content-type': 'application/json',
            }, allowUnattributed: () => true }), /CsrfTokenError/);
        }
    }
    assert.doesNotThrow(() => assertRequestOrigin({ method: 'GET', target, headers: { origin: 'https://evil.example' } }));
    assert.throws(() => assertRequestOrigin({ method: 'GET', target, headers: {}, protectSafeMethod: true }), /CsrfTokenError/);
});

test('unattributed simple requests fail closed while JSON, AJAX and scoped native callers remain compatible', () => {
    const check = (headers: Record<string, string>, allowUnattributed?: () => boolean) => assertRequestOrigin({
        method: 'POST', target, headers, allowUnattributed,
    });
    for (const contentType of ['', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=fixture']) {
        assert.throws(() => check({ 'content-type': contentType }), /CsrfTokenError/);
    }
    assert.doesNotThrow(() => check({ 'content-type': 'application/json; charset=utf-8' }));
    assert.doesNotThrow(() => check({ 'x-requested-with': 'XMLHttpRequest' }));
    assert.doesNotThrow(() => check({ 'sec-fetch-site': 'same-origin' }));
    assert.throws(() => check({ 'sec-fetch-site': 'same-site' }), /CsrfTokenError/);
    assert.throws(() => check({ 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, () => true), /CsrfTokenError/);
    assert.doesNotThrow(() => check({ 'content-type': 'multipart/form-data' }, () => true));
    assert.throws(() => check({ 'content-type': 'multipart/form-data' }, () => false), /CsrfTokenError/);
    assert.throws(() => check({ 'sec-fetch-mode': 'navigate', 'content-type': 'multipart/form-data' }, () => true), /CsrfTokenError/);
});

test('CORS accepts only explicit origins or legacy hosts with the target scheme', () => {
    assert.equal(isAllowedRequestOrigin('https://client.example', target, 'client.example'), true);
    assert.equal(isAllowedRequestOrigin('http://client.example', target, 'client.example'), false);
    assert.equal(isAllowedRequestOrigin('https://client.example:8443', target, 'https://client.example:8443'), true);
    assert.equal(isAllowedRequestOrigin('https://client.example.evil.example', target, 'client.example'), false);
    assert.equal(isAllowedRequestOrigin('https://client.example', target, 'https://client.example/path'), false);
    assert.equal(requestTargetOrigin('http', 'oj.example', 'https://oj.example/'), target);
    assert.equal(requestTargetOrigin('https', 'oj.example', 'http://oj.example/'), target);
    assert.equal(requestTargetOrigin('http', 'localhost:2333', 'https://oj.example/'), 'http://localhost:2333');
    assert.equal(requestTargetOrigin('https', 'domain.example', 'https://oj.example/'), 'https://domain.example');
    assert.equal(requestTargetOrigin('http', 'oj.example', '/'), 'http://oj.example');
    assert.equal(requestTargetOrigin('http', 'oj.example', 'https://password@oj.example/'), 'http://oj.example');
    const request = new IncomingMessage(new Socket());
    request.headers = { host: 'backend.internal:2333', 'x-forwarded-host': 'oj.example', 'x-forwarded-proto': 'https', origin: target };
    const app = new Koa({ proxy: true });
    const context = app.createContext(request, new ServerResponse(request));
    assert.doesNotThrow(() => assertRequestOrigin({ method: 'POST', headers: request.headers,
        target: `${context.protocol}://${context.host}` }));
    app.proxy = false;
    assert.throws(() => assertRequestOrigin({ method: 'POST', headers: request.headers,
        target: `${context.protocol}://${context.host}` }), /CsrfTokenError/);
});
