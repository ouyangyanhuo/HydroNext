import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const source = transformSync(readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), {
    loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).code;

test('plugin split chunks, CSS and binary assets are served without corrupting HydroNext constants', async () => {
    let constantHandler: any;
    let started: () => Promise<void>;
    let options: any;
    let includePlugins = true;
    const binary = Buffer.from([0, 255, 128, 13, 10]);
    const module = { exports: {} as any };
    const locale = { __interface: true, __id: 'zh', __langname: 'Chinese', __flag: 'CN',
        [Symbol.for('iterate')]: { Hello: 'Hello' } };
    const connect = () => {};
    const mocks: Record<string, any> = {
        fs: { existsSync: () => includePlugins, readFileSync: () => '<!-- __HYDRO_INJECTION__DO_NOT_REMOVE_THIS__ -->' },
        esbuild: { build: async (value: any) => {
            options = value;
            return { errors: [], outputFiles: [
                { path: '/plugins-dist/plugins.js', text: "import './chunk-test.js';" },
                { path: '/plugins-dist/chunk-test.js', text: 'export const value = 1;' },
                { path: '/plugins-dist/plugins.css', text: '.plugin { color: red; }' },
                { path: '/plugins-dist/asset-test.png', contents: binary },
            ], metafile: { outputs: { '/plugins-dist/plugins.js': { cssBundle: '/plugins-dist/plugins.css' } } } };
        } },
        'koa2-connect/ts': connect, vite: {},
        '@hydrooj/framework': { serializer: () => undefined },
        hydrooj: { Handler: class {}, Types: {}, param: () => () => {}, size: String,
            NotFoundError: Error, SettingModel: { langs: { cc: { display: 'C++' } } },
            Logger: class { info() {} success() {} error() {} debug() {} } },
        'simple-git': { simpleGit: () => ({ log: async () => ({ all: [] }), status: async () => ({ isClean: () => true }) }) },
        './build-identifier': { resolveBuildIdentifier: () => 'retained-build', resolveBuildTime: () => 'retained-time' },
    };
    runInNewContext(source, {
        module, exports: module.exports, Buffer, console, __dirname: '/ui-next',
        process: { env: {}, cwd: () => '/workspace' },
        global: { addons: { example: '/addon' }, Hydro: { version: { hydrooj: '5.0.7' }, locales: { zh: locale } } },
        require: (name: string) => mocks[name] || require(name),
    });
    await module.exports.apply({
        setting: { get: () => '' },
        Route: (_name: string, _path: string, target: any) => { constantHandler = target; },
        on: (event: string, callback: any) => { if (event === 'app/started') started = callback; },
        inject: (_deps: string[], callback: () => any) => callback(), debounce: (callback: any) => callback,
        server: { registerRenderer() {} },
    });
    await started!();
    assert.equal(options.format, 'esm');
    assert.equal(options.splitting, true);
    const read = async (name: string) => {
        const target = Reflect.construct(constantHandler, []);
        target.response = { headers: {}, addHeader(key: string, value: string) { this.headers[key] = value; } };
        await target.all('system', name);
        return target.response;
    };
    const entry = await read('plugins.js');
    assert.match(entry.body, /document.createElement\('style'\)/);
    assert.match(entry.body, /chunk-test\.js/);
    assert.match((await read('chunk-test.js')).body, /export const value/);
    const asset = await read('asset-test.png');
    assert.equal(asset.type, 'image/png');
    assert.deepEqual(asset.body, binary);
    assert.match((await read('code-langs.js')).body, /window.HydroCodeLangs=window.LANGS=/);
    assert.match((await read('lang-zh.js')).body, /window.HydroLocale=/);
    assert.equal((await read('plugins.js')).headers.ETag, entry.headers.ETag);
    includePlugins = false;
    await started!();
    await assert.rejects(read('chunk-test.js'));
    assert.match((await read('versions.js')).body, /5\.0\.7/);
});
