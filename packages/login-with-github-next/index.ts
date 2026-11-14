import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import {
    Context, ForbiddenError, Handler, SettingModel, superagent, SystemModel, TokenModel, UserFacingError, ValidationError,
} from 'hydrooj';
import { callbackUrl, FAMILY, KEYS, NAMESPACE, safeRedirect } from './config';

export const inject = ['oauth', 'setting'];
const PROVIDER = 'github';
const STATE_PROVIDER = 'github-next';
const STATE_TTL = 600;
const AUTH_ORIGIN = 'https://github.com';
const API_ORIGIN = 'https://api.github.com';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// GitHub mark, adapted from the existing login-with-github addon (https://github.com/logos).
// Encode the SVG as an image URL: ui-next does not render trusted provider HTML.
// eslint-disable-next-line max-len
const icon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#808080" d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.725-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.49.998.108-.775.42-1.305.763-1.605-2.665-.305-5.467-1.335-5.467-5.93 0-1.31.467-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.175 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.552 3.297-1.23 3.297-1.23.647 1.652.24 2.872.12 3.175.765.84 1.23 1.91 1.23 3.22 0 4.61-2.807 5.62-5.48 5.92.43.37.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.295 24 17.795 24 12.5c0-6.63-5.37-12-12-12z"/></svg>')}`;

function getConfig() {
    const clientId = String(SystemModel.get(KEYS.clientId) || '').trim();
    const clientSecret = String(SystemModel.get(KEYS.clientSecret) || '').trim();
    const redirectUri = callbackUrl(SystemModel.get('server.url'));
    return { clientId, clientSecret, redirectUri, enabled: SystemModel.get(KEYS.enabled) === true,
        canRegister: SystemModel.get(KEYS.canRegister) !== false,
        fingerprint: hash(JSON.stringify([clientId, clientSecret, redirectUri])) };
}

function requireConfig() {
    const config = getConfig();
    if (!config.enabled || !config.clientId || !config.clientSecret || !config.redirectUri) {
        throw new ForbiddenError('GitHub login is unavailable. Please contact the administrator.');
    }
    return config;
}

function checkSettings(handler: Handler) {
    const input = handler.args[NAMESPACE];
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new ValidationError(NAMESPACE);
    for (const field of ['clientId', 'clientSecret']) {
        if (input?.[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > 2048)) {
            throw new ValidationError(KEYS[field]);
        }
    }
    const truth = (value: unknown) => value === true || value === 'true' || value === 'on';
    const enabled = input?.enabled === undefined ? getConfig().enabled : truth(input.enabled);
    if (!enabled) return;
    const id = String(input?.clientId ?? SystemModel.get(KEYS.clientId) ?? '').trim();
    const secret = String(input?.clientSecret || SystemModel.get(KEYS.clientSecret) || '').trim();
    if (!/^[a-zA-Z0-9_.-]{1,200}$/.test(id)) throw new ValidationError(KEYS.clientId);
    if (!secret) throw new ValidationError(KEYS.clientSecret);
    if (!callbackUrl(handler.args.server?.url ?? SystemModel.get('server.url'))) throw new ValidationError('server.url');
}

async function githubIdentity(code: string, state: string, verifier: string, config: ReturnType<typeof requireConfig>) {
    try {
        const response = await superagent.post(`${AUTH_ORIGIN}/login/oauth/access_token`)
            .set('Accept', 'application/json').redirects(0).timeout({ response: 5000, deadline: 10000 })
            .send({ client_id: config.clientId, client_secret: config.clientSecret, code,
                redirect_uri: config.redirectUri, state, code_verifier: verifier });
        const token = response.body?.access_token;
        if (response.body?.error || typeof token !== 'string' || !/^[a-zA-Z0-9_]{1,512}$/.test(token)) throw new Error('Invalid response');
        const read = (endpoint: string) => superagent.get(`${API_ORIGIN}${endpoint}`)
            .set('User-Agent', 'HydroNext-GitHub-Login').set('Accept', 'application/vnd.github+json')
            .set('Authorization', `Bearer ${token}`).redirects(0).timeout({ response: 5000, deadline: 10000 });
        // Always verify email ownership; the public /user.email field is not a verification assertion.
        const [profile, emails] = await Promise.all([read('/user'), read('/user/emails?per_page=100')]);
        const verified = Array.isArray(emails.body)
            ? emails.body.filter((entry) => entry?.verified === true && typeof entry.email === 'string' && entry.email.length <= 254
                && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(entry.email)) : [];
        const email = (verified.find((entry) => entry.primary === true) || verified[0])?.email;
        if (!email) throw new ForbiddenError('GitHub login requires a verified email address.');
        const id = profile.body?.id;
        const login = profile.body?.login;
        if (!Number.isSafeInteger(id) || id <= 0 || typeof login !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(login)) {
            throw new Error('Invalid identity');
        }
        return { _id: String(id), email, uname: [login], avatar: `github:${login}`,
            bio: typeof profile.body.bio === 'string' ? profile.body.bio.slice(0, 4096) : '' };
    } catch (error) {
        if (error instanceof ForbiddenError) throw error;
        // Never reflect remote bodies, access tokens, request headers or Client Secret into an error page/log.
        throw new UserFacingError('GitHub login failed. Please try again.');
    }
}

export async function apply(ctx: Context) {
    if (ctx.oauth.providers[PROVIDER]) throw new Error('Disable login-with-github before enabling login-with-github-next.');
    ctx.setting.SystemSetting(
        SettingModel.Setting(FAMILY, KEYS.enabled, false, 'boolean', 'Enable GitHub login'),
        SettingModel.Setting(FAMILY, KEYS.clientId, '', 'text', 'GitHub Client ID'),
        SettingModel.Setting(FAMILY, KEYS.callbackUrl, '', 'text', 'GitHub Authorization callback URL', '', SettingModel.FLAG_DISABLED),
        SettingModel.Setting(FAMILY, KEYS.canRegister, true, 'boolean', 'Allow registration with GitHub'),
        SettingModel.Setting(FAMILY, KEYS.clientSecret, '', 'password', 'GitHub Client Secret',
            'Leave blank to keep the current Client Secret.', SettingModel.FLAG_SECRET),
    );
    ctx.on('handler/before/SystemSetting#post', checkSettings);
    ctx.on('handler/after/SystemSetting#get', (handler) => {
        const current = handler.response.body?.current;
        if (!current) return;
        current[KEYS.clientSecret] = '';
        current[KEYS.callbackUrl] = callbackUrl(SystemModel.get('server.url')) || '';
    });
    await ctx.oauth.provide(PROVIDER, {
        text: 'Login with GitHub', name: 'GitHub', icon,
        get hidden() {
            const config = getConfig();
            return !config.enabled || !config.clientId || !config.clientSecret || !config.redirectUri;
        },
        get canRegister() { return getConfig().canRegister; },
        async get(this: Handler) {
            const config = requireConfig();
            await this.limitRate('github_next_oauth', 60, 10);
            const binding = this.session.oauthBind === PROVIDER;
            if (binding && !this.user._id) throw new ForbiddenError('GitHub login session expired. Please start again.');
            const fallback = this.url(binding ? 'home_security' : 'homepage');
            const redirect = safeRedirect(this.session.oauthRedirect, config.redirectUri, fallback);
            if (this.session._githubNext?.state) await TokenModel.del(this.session._githubNext.state, TokenModel.TYPE_OAUTH);
            const nonce = randomBytes(32).toString('base64url');
            const verifier = randomBytes(48).toString('base64url');
            const state = randomBytes(32).toString('base64url');
            await TokenModel.add(TokenModel.TYPE_OAUTH, STATE_TTL, {
                provider: STATE_PROVIDER, nonceHash: hash(nonce), uid: this.user._id, binding,
                redirect, verifier, fingerprint: config.fingerprint,
            }, state);
            this.session._githubNext = { state, nonce };
            this.session.oauthBind = binding ? PROVIDER : null;
            this.session.oauthRedirect = redirect;
            const url = new URL('/login/oauth/authorize', AUTH_ORIGIN);
            url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
                scope: 'read:user user:email', state, code_challenge_method: 'S256',
                code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
            this.response.redirect = url.href;
        },
        async callback(this: Handler, args) {
            const config = requireConfig();
            const invalid = () => new ForbiddenError('GitHub login session expired. Please start again.');
            const local = this.session._githubNext;
            if (typeof args.state !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(args.state)
                || !local || local.state !== args.state || typeof local.nonce !== 'string') throw invalid();
            const record = await TokenModel.get(args.state, TokenModel.TYPE_OAUTH);
            const expires = new Date(record?.expireAt).getTime();
            if (!record || record.provider !== STATE_PROVIDER || record.uid !== this.user._id
                || record.binding !== (this.session.oauthBind === PROVIDER) || record.fingerprint !== config.fingerprint
                || !Number.isFinite(expires) || expires <= Date.now() || !/^[a-f0-9]{64}$/.test(record.nonceHash || '')
                || !timingSafeEqual(Buffer.from(record.nonceHash, 'hex'), Buffer.from(hash(local.nonce), 'hex'))) throw invalid();
            if (!await TokenModel.del(args.state, TokenModel.TYPE_OAUTH)) throw invalid();
            delete this.session._githubNext;
            this.session.oauthRedirect = record.redirect;
            if (args.error === 'access_denied') throw new ForbiddenError('GitHub authorization was canceled.');
            if (args.error) throw new UserFacingError('GitHub login failed. Please try again.');
            if (typeof args.code !== 'string' || !args.code || args.code.length > 1024) throw invalid();
            return githubIdentity(args.code, args.state, record.verifier, config);
        },
    });
}
