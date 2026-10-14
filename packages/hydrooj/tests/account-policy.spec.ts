import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import * as policy from '../src/lib/account-policy';

const require = createRequire(import.meta.url);
const mailSettings = {
    'smtp.host': 'mail.example', 'smtp.user': 'sender', 'smtp.pass': 'secret', 'smtp.from': 'sender@example.com',
};

test('registration is enabled by default and recovery fails closed until SMTP is configured', () => {
    assert.deepEqual(policy.getAccountCapabilities(() => undefined), { registrationEnabled: true, passwordResetEnabled: false });
    assert.equal(policy.isRegistrationEnabled((key) => key === 'server.allowRegister' ? false : undefined), false);
    assert.equal(policy.isPasswordResetEnabled((key) => mailSettings[key]), true);
    for (const missing of Object.keys(mailSettings)) {
        assert.equal(policy.isPasswordResetEnabled((key) => key === missing ? '  ' : mailSettings[key]), false);
    }
    assert.equal(policy.isPasswordResetEnabled((key) => key === 'server.login' ? false : mailSettings[key]), false);
    assert.deepEqual(Object.keys(policy.getAccountCapabilities((key) => mailSettings[key])).sort(), ['passwordResetEnabled', 'registrationEnabled']);
});

async function fixture(overrides: Record<string, unknown> = {}) {
    const settings = {
        'server.login': true, 'smtp.verify': true, 'session.unsaved_expire_seconds': 3600, 'server.url': 'https://oj.example/', ...overrides,
    };
    const tokens = new Map<string, any>();
    const users = new Map<number, any>();
    const sent: any[] = [];
    const rendered: any[] = [];
    const bindings: any[] = [];
    const routes: Record<string, any> = {};
    const permissions: Record<string, unknown> = {};
    let sequence = 0;
    const errors = Object.fromEntries([
        'RegistrationDisabledError', 'PasswordResetUnavailableError', 'InvalidTokenError', 'BuiltinLoginError',
        'UserAlreadyExistError', 'BlacklistedError', 'ValidationError', 'VerifyPasswordError', 'UserNotFoundError', 'ForbiddenError',
    ].map((name) => [name, class extends Error { constructor() { super(name); } }]));
    const token = {
        TYPE_REGISTRATION: 2, TYPE_LOSTPASS: 5, TYPE_TEXTS: { 2: 'Registration', 5: 'Lost Password' },
        add: async (type: number, _expiry: number, data: any) => {
            const id = `token-${++sequence}`;
            const doc = { ...data, tokenType: type, expireAt: new Date(Date.now() + 3600000) };
            tokens.set(id, doc);
            return [id, doc];
        },
        get: async (id: string, type: number) => tokens.get(id)?.tokenType === type ? tokens.get(id) : null,
        del: async (id: string, type: number) => tokens.get(id)?.tokenType === type && tokens.delete(id),
    };
    const user = {
        getByEmail: async (_domain: string, mail: string) => [...users.values()].find((u) => u.mail === mail),
        getByUname: async (_domain: string, uname: string) => [...users.values()].find((u) => u.uname === uname),
        create: async (mail: string, uname: string, password: string, _uid: unknown, _ip: string, priv: unknown) => {
            const id = users.size + 10;
            assert.equal(priv, undefined, 'public registration must never assign administrator privileges');
            users.set(id, { _id: id, mail, uname, password });
            return id;
        },
        getById: async (_domain: string, uid: number) => users.get(uid),
        setById: async (uid: number, data: any) => Object.assign(users.get(uid), data),
        setPassword: async (uid: number, password: string) => { users.get(uid).password = password; },
    };
    let blocked = false;
    const mocks = {
        '../error': errors,
        '../lib/account-policy': policy,
        '../lib/mail': { sendMail: async (...args: any[]) => { sent.push(args); } },
        '../model/blacklist': { get: async () => blocked },
        '../model/builtin': { PRIV: { PRIV_REGISTER_USER: 8 }, PERM: { PERM_ALL: -1n }, STATUS: {} },
        '../model/domain': { setUserInDomain: async () => {} },
        '../model/system': { get: (key: string) => settings[key] },
        '../model/oplog': { log: async () => {} },
        '../model/token': token,
        '../model/user': user,
        '../utils': { randomstring: () => 'random' },
        '../service/server': {
            Handler: class {}, param: () => () => {}, Query: () => ({}),
            Types: { Username: [null, (name: string) => name?.length >= 2] },
        },
    };
    const module = { exports: {} as any };
    const source = readFileSync(new URL('../src/handler/user.ts', import.meta.url), 'utf8');
    const code = transformSync(source, { loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    runInNewContext(code, { module, exports: module.exports, Buffer,
        require: (id: string) => mocks[id] ?? (id.startsWith('.') ? {} : require(id)) });
    const ctx = {
        serial: async () => {}, inject: async () => {},
        oauth: {
            providers: {} as Record<string, any>,
            provide(name: string, provider: any) { this.providers[name] = provider; },
            get: async () => undefined,
            set: async (...args: any[]) => { bindings.push(args); },
        },
        Route(name: string, _url: string, value: any, priv: unknown) { routes[name] = value; permissions[name] = priv; },
    };
    await module.exports.apply(ctx);
    return {
        settings, tokens, users, sent, rendered, bindings, ctx, permissions, token,
        blockMail() { blocked = true; },
        handler(name: string) {
            const h = Reflect.construct(routes[name], []);
            Object.assign(h, {
                response: {}, domain: {}, request: { ip: '127.0.0.1' }, session: {}, context: { HydroContext: {} }, ctx,
                limitRate: async () => {}, checkPriv: () => {},
                url: (route: string, args: any = {}) => {
                    const path = route === 'user_register_with_code' ? 'register' : route === 'user_lostpass_with_code' ? 'lostpass' : route;
                    return `/d/team/${path}/${args.code || ''}`;
                },
                renderHTML: async (template: string, data: any) => { rendered.push({ template, data }); return '<html>mail</html>'; },
            });
            return h;
        },
    };
}

test('registration routes retain the privilege model and closing registration blocks both entry points', async () => {
    const f = await fixture({ 'server.allowRegister': false });
    for (const name of ['user_register', 'user_register_with_code']) {
        assert.equal(f.permissions[name], 8);
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(f.handler(name).prepare('team', 'token'), /RegistrationDisabledError/);
    }
    assert.equal(f.tokens.size, 0);
    f.settings['server.allowRegister'] = true;
    await f.handler('user_register').prepare();
});

test('default SMTP permits direct signup; completing a token is one-time and authenticates an ordinary user', async () => {
    const f = await fixture();
    const start = f.handler('user_register');
    await start.prepare();
    await start.post('team', 'student@example.com');
    assert.equal(start.response.redirect, '/d/team/register/token-1');
    assert.equal(f.sent.length, 0);
    const complete = f.handler('user_register_with_code');
    await complete.prepare('team', 'token-1');
    await complete.get();
    assert.equal(complete.response.body.identity, undefined);
    await assert.rejects(complete.post('team', 'secret', 'different', 'student', 'token-1'), /VerifyPasswordError/);
    await complete.post('team', 'secret', 'secret', 'student', 'token-1');
    assert.equal(complete.session.uid, 10);
    assert.equal(f.users.get(10).uname, 'student');
    await assert.rejects(f.handler('user_register_with_code').prepare('team', 'token-1'), /InvalidTokenError/);
    await assert.rejects(start.post('team', 'student@example.com'), /UserAlreadyExistError/);
});

test('expired or malformed registration tokens and blacklisted mail are rejected', async () => {
    const f = await fixture();
    const [id, doc] = await f.token.add(2, 0, { mail: 's@example.com', identity: { provider: 'mail' } });
    for (const expireAt of [new Date(0), undefined, 'invalid']) {
        doc.expireAt = expireAt;
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(f.handler('user_register_with_code').prepare('team', id), /InvalidTokenError/);
    }
    f.blockMail();
    await assert.rejects(f.handler('user_register').post('team', 's@example.com'), /BlacklistedError/);
    assert.equal(f.users.size, 0);
});

test('concurrent completion of one registration token creates exactly one ordinary account', async () => {
    const f = await fixture();
    await f.handler('user_register').post('team', 's@example.com');
    const first = f.handler('user_register_with_code');
    const second = f.handler('user_register_with_code');
    await Promise.all([first.prepare('team', 'token-1'), second.prepare('team', 'token-1')]);
    const results = await Promise.allSettled([
        first.post('team', 'secret', 'secret', 'first-user', 'token-1'),
        second.post('team', 'secret', 'secret', 'second-user', 'token-1'),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(f.users.size, 1);
});

test('expired password reset tokens never modify an account', async () => {
    const f = await fixture();
    f.users.set(10, { _id: 10, uname: 'student', password: 'original' });
    const [id, doc] = await f.token.add(5, 0, { uid: 10 });
    doc.expireAt = new Date(0);
    const reset = f.handler('user_lostpass_with_code');
    await assert.rejects(reset.get({ domainId: 'team', code: id }), /InvalidTokenError/);
    await assert.rejects(reset.post('team', id, 'newpass', 'newpass'), /InvalidTokenError/);
    assert.equal(f.users.get(10).password, 'original');
});

test('email verification and password recovery preserve domain links and never expose SMTP credentials', async () => {
    const f = await fixture(mailSettings);
    const start = f.handler('user_register');
    await start.post('team', 'student@example.com');
    assert.equal(start.response.body.verificationEmailSent, true);
    assert.equal(f.rendered[0].data.path, '/d/team/register/token-1');
    assert.equal(f.rendered[0].data.url_prefix, 'https://oj.example');
    f.users.set(10, { _id: 10, mail: 'student@example.com', uname: 'student' });
    const reset = f.handler('user_lostpass');
    await reset.post('team', 'student@example.com');
    assert.equal(reset.response.body.recoveryEmailSent, true);
    assert.equal(f.rendered[1].data.url, '/d/team/lostpass/token-2');
    assert.equal(f.sent.length, 2);
    assert.doesNotMatch(JSON.stringify([start.response.body, reset.response.body]), /secret|smtp/);
    const complete = f.handler('user_lostpass_with_code');
    await assert.rejects(complete.post('team', 'token-2', 'newpass', 'different'), /VerifyPasswordError/);
    await complete.post('team', 'token-2', 'newpass', 'newpass');
    assert.equal(f.users.get(10).password, 'newpass');
    await assert.rejects(complete.post('team', 'token-2', 'newpass', 'newpass'), /InvalidTokenError/);
});

test('unconfigured or incomplete SMTP rejects forged recovery requests before creating a token', async () => {
    for (const config of [{}, { 'smtp.user': 'sender' }]) {
        // eslint-disable-next-line no-await-in-loop
        const f = await fixture(config);
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(f.handler('user_lostpass').post('team', 's@example.com'), /PasswordResetUnavailableError/);
        assert.equal(f.tokens.size, 0);
        assert.equal(f.sent.length, 0);
    }
});

test('OAuth registration follows the switch while existing OAuth users may still log in', async () => {
    const f = await fixture({ 'server.allowRegister': false });
    f.ctx.oauth.providers.external = {
        canRegister: true, callback: async () => ({ _id: ['first', 'second'], email: 's@example.com', uname: ['student'] }),
    };
    await assert.rejects(f.handler('user_oauth_callback').get({ type: 'external' }), /RegistrationDisabledError/);
    f.users.set(10, { _id: 10, mail: 's@example.com', uname: 'student' });
    const existing = f.handler('user_oauth_callback');
    await existing.get({ type: 'external' });
    assert.equal(existing.session.uid, 10);
    f.users.clear();
    f.settings['server.allowRegister'] = true;
    const start = f.handler('user_oauth_callback');
    await start.get({ type: 'external' });
    const complete = f.handler('user_register_with_code');
    await complete.prepare('team', 'token-1');
    await complete.post('team', 'secret', 'secret', 'student', 'token-1');
    assert.deepEqual(f.bindings.slice(-2).map((binding) => binding[1]), ['first', 'second']);
});
