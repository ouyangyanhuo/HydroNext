import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync, transformSync } from 'esbuild';
import { test } from 'node:test';
import { callbackUrl, KEYS, NAMESPACE, safeRedirect } from '../config.ts';

const require = createRequire(import.meta.url);
const built = buildSync({ entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['hydrooj'] }).outputFiles[0].text;

async function fixture(options: any = {}) {
    const values = new Map<string, any>(Object.entries({ 'server.url': 'https://oj.example/',
        [KEYS.enabled]: true, [KEYS.clientId]: 'client-id', [KEYS.clientSecret]: 'private-secret', ...options.settings }));
    const events = new Map<string, any>();
    const settings: any[] = [];
    const requests: any[] = [];
    const tokens = new Map<string, any>();
    let provider: any;
    class ForbiddenError extends Error {}
    class UserFacingError extends Error {}
    class ValidationError extends Error {}
    const request = (method: string, url: string) => {
        const item: any = { method, url, headers: {} };
        requests.push(item);
        return {
            set(key: string, value: string) { item.headers[key] = value; return this; },
            send(body: any) { item.body = body; return this; },
            redirects(value: number) { item.redirects = value; return this; },
            timeout(value: any) { item.timeout = value; return this; },
            then(resolve: any, reject: any) {
                return Promise.resolve().then(() => {
                    if (options.networkFailure) throw new Error('private-secret gho_test remote failure');
                    if (method === 'POST') {
                        return { body: { access_token: 'gho_test' } };
                    }
                    if (url.includes('/user/emails')) {
                        return { body: options.emails ?? [
                            { email: 'unverified@example.com', primary: false, verified: false },
                            { email: 'verified@example.com', primary: true, verified: true },
                        ] };
                    }
                    return { body: { id: 12345, login: 'octocat', email: 'unverified@example.com', bio: 'Hello' } };
                }).then(resolve, reject);
            },
        };
    };
    const ctx = { oauth: { providers: options.duplicate ? { github: {} } : {}, provide: async (_id: string, value: any) => { provider = value; } },
        setting: { SystemSetting: (...items: any[]) => { settings.push(...items); return () => {}; } },
        effect: (callback: any) => callback(), on: (event: string, callback: any) => events.set(event, callback) };
    const module = { exports: {} as any };
    runInNewContext(built, { module, exports: module.exports, URL, URLSearchParams, Buffer,
        require: (name: string) => name === 'hydrooj' ? {
            ForbiddenError, UserFacingError, ValidationError,
            SystemModel: { get: (key: string) => values.get(key) },
            SettingModel: { FLAG_SECRET: 4, FLAG_DISABLED: 2, Setting: (family: string, key: string, value: any,
                type: string, label: string, desc: string, flag: number) => ({ family, key, value, type, name: label, desc, flag }) },
            TokenModel: { TYPE_OAUTH: 4,
                add: async (_type: number, ttl: number, data: any, id: string) => {
                    tokens.set(id, { ...data, _id: id, expireAt: new Date(Date.now() + ttl * 1000) }); return [id];
                },
                get: async (id: string) => tokens.get(id), del: async (id: string) => tokens.delete(id) },
            superagent: { post: (url: string) => request('POST', url), get: (url: string) => request('GET', url) },
        } : require(name) });
    await module.exports.apply(ctx);
    const handler = { args: {}, user: { _id: options.uid || 0 }, session: { oauthRedirect: '/d/team/p/123?editor=1' } as any,
        response: { redirect: '', body: {} } as any,
        url: (name: string) => `/d/team/${name === 'homepage' ? '' : 'home/security'}`, limitRate: async () => {} };
    return { provider, handler, values, tokens, requests, settings, events };
}

test('GitHub OAuth settings are grouped, secret-redacted, validated, and immediately configurable', async () => {
    const f = await fixture();
    assert.equal(f.settings.length, 5);
    assert.ok(f.settings.every((item) => item.family === 'setting_github_login'));
    assert.deepEqual(f.settings.filter((item) => item.type !== 'boolean').map((item) => item.key),
        [KEYS.clientId, KEYS.callbackUrl, KEYS.clientSecret]);
    assert.equal(f.settings.find((item) => item.key === KEYS.callbackUrl).desc, '');
    assert.equal(f.settings.find((item) => item.key === KEYS.clientSecret).flag, 4);
    assert.equal(f.settings.find((item) => item.key === KEYS.callbackUrl).flag, 2);
    f.handler.response.body.current = { [KEYS.clientSecret]: 'private-secret' };
    f.events.get('handler/after/SystemSetting#get')(f.handler);
    assert.equal(f.handler.response.body.current[KEYS.clientSecret], '');
    assert.equal(f.handler.response.body.current[KEYS.callbackUrl], 'https://oj.example/oauth/github/callback');
    assert.doesNotThrow(() => f.events.get('handler/before/SystemSetting#post')({ args: { [NAMESPACE]: { enabled: true, clientSecret: '' } } }));
    assert.throws(() => f.events.get('handler/before/SystemSetting#post')({ args: { [NAMESPACE]: { enabled: true, clientId: '' } } }));
    assert.throws(() => f.events.get('handler/before/SystemSetting#post')({ args: { server: { url: 'javascript:alert(1)' } } }));
    f.values.set(KEYS.enabled, false);
    assert.equal(f.provider.hidden, true);
    await assert.rejects(f.provider.get.call(f.handler), /unavailable/);
    f.values.set(KEYS.enabled, true);
    assert.equal(f.provider.hidden, false);
    f.values.set(KEYS.canRegister, false);
    assert.equal(f.provider.canRegister, false);
    await assert.rejects(fixture({ duplicate: true }), /Disable login-with-github/);
});

test('GitHub login binds one-time state and PKCE to the browser, preserves domain return, and trusts only verified email', async () => {
    const f = await fixture();
    await f.provider.get.call(f.handler);
    const auth = new URL(f.handler.response.redirect);
    assert.equal(auth.origin, 'https://github.com');
    assert.equal(auth.pathname, '/login/oauth/authorize');
    assert.equal(auth.searchParams.get('redirect_uri'), 'https://oj.example/oauth/github/callback');
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
    const state = auth.searchParams.get('state')!;
    const saved = f.tokens.get(state);
    assert.equal(saved.redirect, '/d/team/p/123?editor=1');
    assert.equal(auth.searchParams.get('code_challenge'), createHash('sha256').update(saved.verifier).digest('base64url'));
    assert.match(f.provider.icon, /^data:image\/svg\+xml,/);
    const identity = await f.provider.callback.call(f.handler, { state, code: 'authorization-code' });
    assert.equal(identity._id, '12345');
    assert.equal(identity.email, 'verified@example.com');
    assert.equal(f.requests[0].body.code_verifier, saved.verifier);
    assert.equal(f.requests[0].body.client_secret, 'private-secret');
    assert.equal(f.handler.session.oauthRedirect, '/d/team/p/123?editor=1');
    assert.equal(f.tokens.size, 0);
    assert.equal(f.handler.session._githubNext, undefined);
    assert.ok(f.requests.every((item) => item.redirects === 0 && item.timeout.deadline === 10000));
    assert.ok(!JSON.stringify(f.handler.session).includes('private-secret'));
    await assert.rejects(f.provider.callback.call(f.handler, { state, code: 'authorization-code' }), /expired/);
});

test('wrong sessions, identity changes, expired state and credential rotation fail before contacting GitHub', async () => {
    for (const mode of ['other-browser', 'wrong-nonce', 'different-user', 'binding-change', 'expired', 'rotated', 'object-state']) {
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture();
        // eslint-disable-next-line no-await-in-loop
        await f.provider.get.call(f.handler);
        const state = f.handler.session._githubNext.state;
        if (mode === 'other-browser') f.handler.session._githubNext = undefined;
        if (mode === 'wrong-nonce') f.handler.session._githubNext.nonce = 'attacker-nonce';
        if (mode === 'different-user') f.handler.user._id = 9;
        if (mode === 'binding-change') f.handler.session.oauthBind = 'github';
        if (mode === 'expired') f.tokens.get(state).expireAt = new Date(Date.now() - 1);
        if (mode === 'rotated') f.values.set(KEYS.clientSecret, 'new-secret');
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(f.provider.callback.call(f.handler,
            { state: mode === 'object-state' ? { $ne: null } : state, code: 'code' }), /expired/);
        assert.equal(f.requests.length, 0, mode);
    }
});

test('verified-email checks, safe errors, binding intent, concurrent state consumption and redirect limits hold', async () => {
    assert.equal(callbackUrl('https://oj.example/base'), 'https://oj.example/base/oauth/github/callback');
    assert.equal(callbackUrl('javascript:alert(1)'), null);
    assert.equal(callbackUrl('https://user:pass@oj.example/'), null);
    for (const value of ['//evil.example/', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)', '\n/evil']) {
        assert.equal(safeRedirect(value, 'https://oj.example/', '/d/team/'), '/d/team/');
    }
    assert.equal(safeRedirect('https://oj.example/d/team/?page=2', 'https://oj.example/', '/'), '/d/team/?page=2');
    const noMail = await fixture({ emails: [{ email: 'unverified@example.com', verified: false }] });
    await noMail.provider.get.call(noMail.handler);
    await assert.rejects(noMail.provider.callback.call(noMail.handler,
        { state: noMail.handler.session._githubNext.state, code: 'code' }), /verified email/);
    const failure = await fixture({ networkFailure: true });
    await failure.provider.get.call(failure.handler);
    await assert.rejects(failure.provider.callback.call(failure.handler, { state: failure.handler.session._githubNext.state, code: 'code' }),
        (error: Error) => error.message === 'GitHub login failed. Please try again.');
    const bound = await fixture({ uid: 9 });
    bound.handler.session.oauthBind = 'github';
    bound.handler.session.oauthRedirect = '//evil.example/';
    await bound.provider.get.call(bound.handler);
    const state = bound.handler.session._githubNext.state;
    const results = await Promise.allSettled([0, 1].map(() => bound.provider.callback.call(bound.handler, { state, code: 'code' })));
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(bound.handler.session.oauthBind, 'github');
    assert.equal(bound.handler.session.oauthRedirect, '/d/team/home/security');
    const denied = await fixture();
    await denied.provider.get.call(denied.handler);
    await assert.rejects(denied.provider.callback.call(denied.handler,
        { state: denied.handler.session._githubNext.state, error: 'access_denied' }), /canceled/);
    assert.equal(denied.tokens.size, 0);
    assert.equal(denied.requests.length, 0);
});

test('ui-next renders a translated GitHub button and sends the current domain and return path to OAuth', async () => {
    const f = await fixture();
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { MantineProvider } = require('@mantine/core');
    let target = '';
    const module = { exports: {} as any };
    const code = transformSync(readFileSync(new URL('../../ui-next/src/components/auth/oauth-buttons.tsx', import.meta.url), 'utf8'),
        { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    runInNewContext(code, { module, exports: module.exports, window: { location: { assign: (url: string) => { target = url; } } },
        require: (name: string) => {
            if (name === '@/hooks/use-i18n') return { useI18n: () => ({ t: (key: string) => key === 'Login with GitHub' ? '使用 GitHub 登录' : key }) };
            if (name === '@/hooks/use-build-url') {
                return { useBuildUrl: () => (_route: string, params: any, query: any) => (
                    `/d/team/oauth/${params.type}/login?${new URLSearchParams(query)}`
                ) };
            }
            if (name === '@/components/common/button') {
                return { Button: ({ children, leftSection }: any) => (
                    React.createElement('button', null, leftSection, children)
                ) };
            }
            return require(name);
        } });
    const { OAuthButtons } = module.exports;
    const element = OAuthButtons({ methods: [{ id: 'github', text: f.provider.text, icon: f.provider.icon }], redirect: '/d/team/p?page=2' });
    const html = renderToStaticMarkup(React.createElement(MantineProvider, null, element));
    assert.match(html, /使用 GitHub 登录/);
    assert.match(html, /src="data:image\/svg\+xml,/);
    element.props.children[1][0].props.onClick();
    assert.equal(target, '/d/team/oauth/github/login?redirect=%2Fd%2Fteam%2Fp%3Fpage%3D2');
    assert.equal(OAuthButtons({ methods: [] }), null);
});
