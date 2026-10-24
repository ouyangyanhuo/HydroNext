import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import c2k from 'koa2-connect/ts';
import { lookup } from 'mime-types';
import { createServer, type Plugin } from 'vite';
import { HandlerCommon, serializer } from '@hydrooj/framework';
import {
    Context, Handler, Logger,
    NotFoundError, param, SettingModel, size, Types,
} from 'hydrooj';
import { resolveBuildIdentifier, resolveBuildTime } from './build-identifier';

const logger = new Logger('ui-next');

const PENDING_HTML = `<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hydro</title>
    <meta http-equiv="refresh" content="3">
</head>
<body>
    <p>Hydro UI is building, please wait and refresh...</p>
</body>
</html>`;

const INJECT_MARKER = '<!-- __HYDRO_INJECTION__DO_NOT_REMOVE_THIS__ -->';
const buildInject = (data: string) => `<script id="__HYDRO_INJECTION__" type="application/json">${data}</script>`;

function getLocaleData(lang?: string): Record<string, string> {
    try {
        const locales = (global as any).Hydro?.locales;
        if (!locales) return {};
        const normalized = (lang || 'zh').replace(/-/g, '_');
        const base = normalized.split('_')[0];
        const candidates = Array.from(new Set(['en', base, normalized]));
        const result: Record<string, string> = {};
        for (const candidate of candidates) {
            Object.assign(result, locales[candidate]?.[Symbol.for('iterate')] || {});
        }
        if (Object.keys(result).length) return result;
        return locales.zh?.[Symbol.for('iterate')] || {};
    } catch { /* ignore */ }
    return {};
}

function getAddonEntries(): Record<string, string> {
    const entries: Record<string, string> = {};
    for (const [name, addon] of Object.entries(global.addons)) {
        const uiEntry = ['ui/index.ts', 'ui/index.tsx', 'ui/index.js', 'ui/index.jsx']
            .map((f) => path.resolve(addon as string, f))
            .find((f) => fs.existsSync(f));
        if (uiEntry) {
            logger.info('UI entry for addon %s: %s', name, uiEntry);
            entries[name] = uiEntry;
        }
    }
    return entries;
}

function getRouteMap(ctx: Context): Record<string, string> {
    const cached = ctx.server.routeMap;
    if (cached && Object.keys(cached).length) return cached;

    const map: Record<string, string> = Object.create(null);
    for (const layer of ctx.server.router?.stack || []) {
        if (layer.name && typeof layer.path === 'string') map[layer.name] = layer.path;
    }
    return map;
}

function hydroPlugins(): Plugin {
    const virtualModuleId = 'virtual:hydro-plugins';
    const resolvedVirtualModuleId = `\0${virtualModuleId}`;

    return {
        name: 'hydro-plugins',
        resolveId(id) {
            if (id === virtualModuleId) {
                return resolvedVirtualModuleId;
            }
            return undefined;
        },
        load(id) {
            if (id === resolvedVirtualModuleId) {
                const entries = getAddonEntries();
                if (!Object.keys(entries).length) return 'export default [];';
                const imports = Object.entries(entries).map(([_, e], i) => `import * as plugin${i} from '${e}';`).join('\n');
                const exports = `export default [${Object.entries(entries).map(([addon, _], i) => {
                    return `{ name: '${addon}', ...plugin${i} }`;
                }).join(', ')}];`;
                return `${imports}\n${exports}`;
            }
            return undefined;
        },
    };
}

const federationPlugin: esbuild.Plugin = {
    name: 'federation',
    setup(b) {
        const mappings: Record<string, string> = {
            react: 'React',
            'react-dom/client': 'ReactDOM',
            'react/jsx-runtime': 'jsxRuntime',
            '@mantine/core': 'Mantine',
            '@mantine/hooks': 'MantineHooks',
            '@mantine/notifications': 'MantineNotifications',
        };

        b.onResolve({ filter: /^@hydrooj\/ui-next/ }, () => ({
            path: 'ui-next',
            namespace: 'hydro-federation',
        }));
        for (const mod of Object.keys(mappings)) {
            b.onResolve({ filter: new RegExp(`^${mod.replaceAll('\\', '\\\\').replaceAll('/', '\\/')}$`) }, () => ({
                path: mod,
                namespace: 'hydro-federation',
            }));
        }
        b.onLoad({ filter: /.*/, namespace: 'hydro-federation' }, (args) => {
            if (args.path === 'ui-next') {
                return { contents: 'module.exports = window.__hydroExports;', loader: 'js' };
            }
            const key = mappings[args.path];
            return { contents: `module.exports = window.__hydroExports['${key}'];`, loader: 'js' };
        });
    },
};

const vfs: Record<string, string | Buffer> = {};
const hashes: Record<string, string> = {};

const applyCss = (css: string) => `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
})();
`;

function addFile(name: string, content: string | Buffer) {
    vfs[name] = content;
    hashes[name] = crypto.createHash('sha1').update(content).digest('hex').substring(0, 8);
}

async function buildI18n() {
    const localeList: Record<string, { name: string, flag: string }> = {};
    for (const lang in global.Hydro.locales) {
        if (!/^[a-zA-Z_]+$/.test(lang)) continue;
        if (!global.Hydro.locales[lang].__interface) continue;
        addFile(`lang-${lang}.js`, `window.HydroLocale=${JSON.stringify(global.Hydro.locales[lang][Symbol.for('iterate')])};`);
        const id = global.Hydro.locales[lang].__id;
        if (id) localeList[id] = { name: global.Hydro.locales[lang].__langname, flag: global.Hydro.locales[lang].__flag };
    }
    addFile('locale-list.js', `window.HydroLocaleList=${JSON.stringify(localeList)};`);
}

async function buildCodeLangs() {
    addFile('code-langs.js', `window.HydroCodeLangs=window.LANGS=${JSON.stringify(SettingModel.langs)};`);
}

async function buildVersions() {
    const versions: Record<string, string> = { ...global.Hydro.version };
    try {
        const { simpleGit } = require('simple-git') as typeof import('simple-git');
        const fetchAddonVersion = async (name: string, addonPath: string) => {
            try {
                const git = simpleGit(addonPath);
                const [log, status] = await Promise.all([git.log(), git.status()]);
                if (log.all.length > 0) {
                    let hash = log.all[0].hash.substring(0, 7);
                    if (!status.isClean()) hash += '-dirty';
                    versions[name] = versions[name] ? `${versions[name]}-${hash}` : hash;
                }
            } catch (e) {
                logger.debug('Could not get git hash for addon %s: %o', name, e);
            }
        };
        await Promise.all(
            Object.entries(global.addons)
                .filter(([name]) => name !== 'hydrooj') // already handled in loader.ts
                .map(([name, addonPath]) => fetchAddonVersion(name, addonPath as string)),
        );
    } catch (e) {
        logger.debug('simple-git not available: %o', e);
    }
    addFile('versions.js', `window.HydroVersions=${JSON.stringify(versions)};`);
}

class UiNextConstantHandler extends Handler {
    noCheckPermView = true;

    @param('name', Types.Filename)
    async all(domainId: string, name: string) {
        if (!(name in vfs)) throw new NotFoundError(name);
        this.response.type = lookup(name) || 'application/octet-stream';
        this.response.body = vfs[name];
        this.response.addHeader('ETag', hashes[name]);
        this.response.addHeader('Cache-Control', 'public, max-age=86400');
    }
}

export async function buildPlugins() {
    const start = Date.now();
    let totalSize = 0;
    const entries = getAddonEntries();

    const newPluginFiles = new Set<string>();
    const emit = (name: string, content: string | Buffer) => {
        addFile(name, content);
        newPluginFiles.add(name);
    };
    const purge = () => {
        for (const key of Object.keys(vfs)) {
            if (!newPluginFiles.has(key)) {
                delete vfs[key];
                delete hashes[key];
            }
        }
    };

    if (!Object.keys(entries).length) {
        emit('plugins.js', 'window.__hydroPlugins = [];');
        purge();
        logger.info('No plugins to build');
        return;
    }

    try {
        const result = await esbuild.build({
            stdin: {
                contents: [
                    ...Object.entries(entries).map(([_, e], i) => `import * as plugin${i} from '${e}';`),
                    `window.__hydroPlugins = [${Object.entries(entries).map(([n], i) => `{ name: '${n}', ...plugin${i} }`).join(', ')}];`,
                ].join('\n'),
                sourcefile: 'plugins.ts',
                resolveDir: process.cwd(),
                loader: 'ts',
            },
            bundle: true,
            format: 'esm',
            splitting: true,
            outdir: 'plugins-dist',
            entryNames: 'plugins',
            chunkNames: 'chunk-[hash]',
            assetNames: 'asset-[hash]',
            metafile: true,
            write: false,
            target: ['chrome90'],
            plugins: [federationPlugin],
            minify: true,
            jsx: 'automatic',
            jsxImportSource: 'react',
        });
        if (result.errors.length) logger.error('Plugin build errors: %o', result.errors);

        const cssText = new Map<string, string>();
        for (const f of result.outputFiles) {
            if (f.path.endsWith('.css')) cssText.set(f.path, f.text);
        }

        const cssForJs = new Map<string, string>();
        const claimed = new Set<string>();
        for (const [rel, meta] of Object.entries(result.metafile.outputs)) {
            if (!meta.cssBundle) continue;
            const css = path.resolve(meta.cssBundle);
            cssForJs.set(path.resolve(rel), css);
            claimed.add(css);
        }

        let unclaimedCss = '';
        for (const [abs, text] of cssText) {
            if (!claimed.has(abs)) unclaimedCss += text;
        }

        for (const f of result.outputFiles) {
            if (f.path.endsWith('.css')) continue;

            const name = path.basename(f.path);
            let content: string | Buffer = name.endsWith('.js') ? f.text : Buffer.from(f.contents);

            const css = cssText.get(cssForJs.get(f.path) ?? '');
            if (css) content = applyCss(css) + content;
            if (name === 'plugins.js' && unclaimedCss) content = applyCss(unclaimedCss) + content;

            totalSize += content.length;
            emit(name, content);
        }

        purge();
        logger.success('Plugins built in %dms (%d entries, %s)', Date.now() - start, Object.keys(entries).length, size(totalSize));
    } catch (e) {
        logger.error('Plugin build failed: %o', e);
    }
}

const HASH_FALLBACK = '00000000';

const getViewLang = (handler: HandlerCommon) => handler.user?.viewLang || handler.session?.viewLang || 'zh';

const injectedScripts = (resolve: (name: string) => string, viewLang: string) => [
    'code-langs.js',
    'locale-list.js',
    `lang-${viewLang}.js`,
    'versions.js',
].map((name) => `<script src="${resolve(name)}"></script>`);

export async function apply(ctx: Context) {
    if (process.env.HYDRO_CLI) return;

    // Allow disabling ui-next via system setting or env var
    const disabled = ctx.setting?.get?.('ui-next.disable') || process.env.HYDRO_UI_NEXT_DISABLE;
    if (disabled) {
        logger.info('ui-next is disabled via configuration');
        return;
    }
    const buildIdentifier = resolveBuildIdentifier(global.Hydro.version.hydrooj);
    const buildTime = resolveBuildTime(process.env, process.cwd(), new Date().toISOString());

    ctx.Route('ui_next_constants', '/plugins/:version/:name', UiNextConstantHandler);

    if (process.env.DEV) {
        ctx.on('app/started', async () => {
            await buildI18n();
            await buildCodeLangs();
            await buildVersions();
        });
        ctx.on('app/i18n/update', buildI18n);
        ctx.on('system/setting', buildCodeLangs);

        const vite = await createServer({
            root: __dirname,
            clearScreen: false,
            server: {
                middlewareMode: true,
                hmr: {
                    port: 3010,
                },
                headers: {
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Embedder-Policy': 'require-corp',
                },
            },
            appType: 'custom',
            plugins: [hydroPlugins()],
        });
        const middleware = c2k(vite.middlewares);
        const capture = ['/@vite/', '/src/', '/node_modules/', '/@react-refresh', '/@fs', '/@id/'];
        for (const route of capture) {
            ctx.server.addCaptureRoute(route, middleware);
        }
        const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
        ctx.server.registerRenderer('next', {
            name: 'next',
            accept: [],
            output: 'html',
            asFallback: true,
            priority: 100,
            async render(name, args, context) {
                context.handler.response.addHeader('Cache-Control', 'no-store');
                const userLang = context.UserContext?.viewLang || context.handler.session?.viewLang;
                const serialized = JSON.stringify({
                    HYDRO_INJECTED: true,
                    name: name === 'error.html' ? 'error'
                        : name === 'bsod.html' ? 'bsod'
                            : context.handler.context._matchedRouteName,
                    template: context.handler.response.template || name || '',
                    args: {
                        UserContext: context.UserContext,
                        UiContext: context.handler.UiContext,
                        ...args,
                    },
                    url: context.handler.context.req.url!,
                    route_map: getRouteMap(ctx),
                    endpoint: ctx.setting.get('server.url') || undefined,
                    build_id: buildIdentifier,
                    build_time: buildTime,
                    locale: getLocaleData(userLang),
                    lang: userLang || 'zh',
                }, serializer(false, context.handler));
                const ts = Date.now();
                const devAssetUrl = (assetName: string) => `/plugins/0/${assetName}?_=${ts}`;
                const injectHtml = [
                    buildInject(serialized),
                    ...injectedScripts(devAssetUrl, getViewLang(context.handler)),
                ].join('\n');
                const htmlToRender = html.replace(INJECT_MARKER, injectHtml);
                return await vite.transformIndexHtml(context.handler.context.req.url!, htmlToRender);
            },
        });

        // eslint-disable-next-line consistent-return
        return async () => {
            await vite.close().catch((e) => console.error(e));
        };
    } else {
        const build = async () => {
            await buildPlugins();
            await buildI18n();
            await buildCodeLangs();
            await buildVersions();
        };
        ctx.on('app/started', build);

        ctx.server.registerRenderer('next', {
            name: 'next',
            accept: [],
            output: 'html',
            asFallback: true,
            priority: 100,
            async render(name, args, context) {
                // HTML selects the current hashed entry. Never reuse an old
                // document after deployment; hashed assets remain cacheable.
                context.handler.response.addHeader('Cache-Control', 'no-store');
                const indexHtml = path.join(__dirname, 'public', 'index.html');
                if (!fs.existsSync(indexHtml)) return PENDING_HTML;
                const html = fs.readFileSync(indexHtml, 'utf-8');
                const userLang = context.UserContext?.viewLang || context.handler.session?.viewLang;
                const serialized = JSON.stringify({
                    HYDRO_INJECTED: true,
                    name: name === 'error.html' ? 'error'
                        : name === 'bsod.html' ? 'bsod'
                            : context.handler.context._matchedRouteName,
                    template: context.handler.response.template || name || '',
                    args: {
                        UserContext: context.UserContext,
                        UiContext: context.handler.UiContext,
                        ...args,
                    },
                    url: context.handler.context.req.url!,
                    route_map: getRouteMap(ctx),
                    endpoint: ctx.setting.get('server.url') || undefined,
                    build_id: buildIdentifier,
                    build_time: buildTime,
                    plugins_url: `/plugins/${hashes['plugins.js'] || '00000000'}/plugins.js`,
                    locale: getLocaleData(userLang),
                    lang: userLang || 'zh',
                }, serializer(false, context.handler));
                const prodAssetUrl = (assetName: string) => `/plugins/${hashes[assetName] || HASH_FALLBACK}/${assetName}`;
                const injectHtml = [
                    buildInject(serialized),
                    ...injectedScripts(prodAssetUrl, getViewLang(context.handler)),
                ].join('\n');
                return html.replace(INJECT_MARKER, injectHtml);
            },
        });
        const debouncedBuild = ctx.debounce(build, 2000);
        const triggerHotUpdate = (filePath?: string) => {
            if (filePath && !filePath.includes('/ui/')) return;
            debouncedBuild();
        };
        ctx.on('app/watch/change', triggerHotUpdate);
        ctx.on('app/watch/unlink', triggerHotUpdate);
        ctx.on('system/setting', debouncedBuild);
        ctx.on('app/i18n/update', debouncedBuild);
    }
    ctx.inject(['model:setting'], buildCodeLangs);
}
