/* eslint-disable no-await-in-loop -- Exercise sequential representations of the same page URL. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import Koa from 'koa';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const module = { exports: {} as any };
const source = transformSync(readFileSync(new URL('../base.ts', import.meta.url), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
runInNewContext(source, {
    module, exports: module.exports, Buffer, Blob,
    require: (name: string) => {
        if (name === '@hydrooj/framework') return { serializer: () => undefined };
        if (name === '@hydrooj/utils/lib/utils') return { errorMessage: (error: Error) => error };
        if (name === './error') return { SystemError: Error, UserFacingError: class extends Error {} };
        return require(name);
    },
});
const middleware = module.exports.default({ error() {} });

async function request(headers: Record<string, string> = {}, options: {
    url?: string; type?: string; etag?: string; fail?: boolean; redirect?: string; template?: boolean;
} = {}) {
    const req = new IncomingMessage(new Socket());
    req.method = 'GET';
    req.url = options.url || '/d/team/record/123';
    req.headers = { host: 'oj.example', ...headers };
    const ctx = new Koa().createContext(req, new ServerResponse(req)) as any;
    ctx.set('Vary', 'Origin');
    ctx.handler = {
        renderHTML: async () => '<!doctype html><html>Page</html>',
        ctx: { server: { routeMap: { record_detail: '/record/:rid' } } },
    };
    ctx._matchedRouteName = 'record_detail';
    await middleware(ctx, async () => {
        if (options.fail) throw new Error('Failed');
        Object.assign(ctx.HydroContext, { user: { _id: 3 }, UiContext: { domainId: 'team' } });
        Object.assign(ctx.HydroContext.response, {
            template: options.template === false ? null : 'record_detail.html',
            type: options.type || '', etag: options.etag, redirect: options.redirect,
            body: { rdoc: { _id: '123' } },
        });
    });
    return ctx;
}

test('HTML and injected JSON at the same URL cannot pollute the document cache', async () => {
    for (const headers of [
        { accept: 'text/html' },
        { accept: 'application/json', 'x-hydro-inject': 'uicontext,usercontext,pagename' },
        { accept: 'text/html' },
    ]) {
        const ctx = await request(headers);
        assert.equal(ctx.response.status, 200);
        assert.equal(ctx.response.get('Cache-Control'), 'no-store');
        const vary = ctx.response.get('Vary').toLowerCase().split(/,\s*/);
        for (const header of ['origin', 'accept', 'x-hydro-inject']) assert.ok(vary.includes(header));
        if (headers.accept === 'application/json') {
            assert.equal(ctx.response.type, 'application/json');
            assert.equal(JSON.parse(ctx.body).UserContext._id, 3);
            assert.equal(ctx.response.get('x-hydro-page'), 'record_detail');
        } else {
            assert.equal(ctx.response.type, 'text/html');
            assert.match(ctx.body, /^<!doctype html>/);
        }
    }
});

test('JSON page responses without injection and explicit noTemplate requests are also not stored', async () => {
    for (const [headers, url] of [
        [{ accept: 'application/json' }, '/record/123'],
        [{ accept: 'text/html' }, '/d/team/record/123?noTemplate=true'],
    ] as const) {
        const ctx = await request(headers, { url });
        assert.equal(ctx.response.type, 'application/json');
        assert.equal(ctx.response.get('Cache-Control'), 'no-store');
    }
});

test('injected data without a template and redirects remain uncacheable', async () => {
    for (const redirect of [undefined, '/d/team/record/456']) {
        const ctx = await request({ accept: 'application/json', 'x-hydro-inject': 'usercontext' }, {
            template: false, redirect,
        });
        assert.equal(ctx.response.get('Cache-Control'), 'no-store');
        assert.equal(JSON.parse(ctx.body).UserContext._id, 3);
    }
});

test('page ETags cannot turn a history navigation into a stale 304 or public cache entry', async () => {
    const ctx = await request({ accept: 'application/json', 'if-none-match': 'shared-tag' }, { etag: 'shared-tag' });
    assert.equal(ctx.response.status, 200);
    assert.equal(ctx.response.get('Cache-Control'), 'no-store');
    assert.equal(ctx.response.get('ETag'), undefined);
});

test('error responses are not cached as replacement page documents', async () => {
    for (const accept of ['application/json', 'text/html']) {
        const ctx = await request({ accept }, { fail: true });
        assert.equal(ctx.response.status, 500);
        assert.equal(ctx.response.get('Cache-Control'), 'no-store');
    }
});

test('explicit non-page resource caching and conditional requests are preserved', async () => {
    const options = { template: false, type: 'application/javascript', etag: 'asset-tag' };
    const fresh = await request({}, options);
    assert.equal(fresh.response.get('Cache-Control'), 'public');
    assert.equal(fresh.response.get('ETag'), 'asset-tag');
    const cached = await request({ 'if-none-match': 'asset-tag' }, options);
    assert.equal(cached.response.status, 304);
});
