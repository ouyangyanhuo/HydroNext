import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { containerUptime, getRuntimeInfo } from '../src/lib/runtime-info.ts';

const now = Date.parse('2026-10-08T08:30:00Z');
const stat = (ticks: number, name = 'entrypoint.sh') => `1 (${name}) S ${Array.from({ length: 18 }, () => '0').join(' ')} ${ticks} 0 0`;
function dependencies(container = true) {
    return {
        isContainer: async () => container,
        readFile: async (path: string) => path === '/proc/1/stat' ? stat(8640000) : '90000.50 80000.00',
        clockTicks: async () => 100,
        now: () => now,
        processUptime: () => 7.25,
    };
}

test('container uptime uses PID 1 rather than host boot or the restarted application worker', async () => {
    const deps = dependencies();
    const info = await getRuntimeInfo(deps);
    assert.equal(info.kind, 'container');
    assert.equal(info.uptimeSeconds, 3600.5);
    assert.equal(info.startedAt, new Date(now - 3600500).toISOString());
    assert.equal(info.sampledAt, new Date(now).toISOString());
    deps.processUptime = () => 0.25;
    assert.deepEqual(await getRuntimeInfo(deps), info);
});

test('actual CLK_TCK units are used and process names with spaces and parentheses are parsed safely', () => {
    assert.equal(containerUptime(stat(25000, 'entry (worker) name)'), '200.5 123.0', 250), 100.5);
    assert.equal(containerUptime(stat(0), '0.0 0.0', 100), 0);
});

test('non-container development mode reports application runtime and never reads host PID 1', async () => {
    const deps = dependencies(false);
    deps.readFile = async () => { throw new Error('Host procfs must not be accessed'); };
    const info = await getRuntimeInfo(deps);
    assert.equal(info.kind, 'application');
    assert.equal(info.containerDetected, false);
    assert.equal(info.uptimeSeconds, 7.25);
    assert.equal(info.startedAt, new Date(now - 7250).toISOString());
});

test('restricted procfs or missing getconf explicitly fall back instead of failing the dashboard', async () => {
    for (const failure of ['readFile', 'clockTicks'] as const) {
        const deps = dependencies();
        deps[failure] = async () => { throw new Error('Unavailable'); };
        // eslint-disable-next-line no-await-in-loop
        const info = await getRuntimeInfo(deps);
        assert.equal(info.kind, 'application');
        assert.equal(info.containerDetected, true);
        assert.equal(info.uptimeSeconds, 7.25);
    }
});

test('invalid counters cannot turn host uptime or NaN into a container startup timestamp', async () => {
    for (const [data, uptime, ticks] of [
        ['garbage', '90000 0', 100], [stat(100), 'invalid 0', 100], [stat(100), '90000 0', 0],
        [stat(-1), '90000 0', 100], [stat(20000), '1 0', 100], [stat(100), '-1 0', 100], [stat(0), '', 100],
    ] as [string, string, number][]) {
        assert.throws(() => containerUptime(data, uptime, ticks));
    }
    const deps = dependencies();
    deps.readFile = async () => 'malformed';
    assert.equal((await getRuntimeInfo(deps)).kind, 'application');
});

test('management dashboard keeps its global administrator check and injects the runtime snapshot', async () => {
    const require = createRequire(import.meta.url);
    const module = { exports: {} as any };
    let admin = false;
    let runtimeReads = 0;
    const info = await getRuntimeInfo(dependencies());
    const mocks: Record<string, any> = {
        '../lib/runtime-info': { getRuntimeInfo: async () => { runtimeReads += 1; return info; } },
        '../logger': { Logger: class {} },
        '../model/builtin': { PRIV: { PRIV_EDIT_SYSTEM: 1 } },
        '../service/server': { Handler: class {
            checkPriv(value: number) {
                assert.equal(value, 1);
                if (!admin) throw new Error('Access denied');
            }
        }, ConnectionHandler: class {}, param: () => () => {}, requireSudo: () => undefined, Types: {} },
    };
    const source = readFileSync(new URL('../src/handler/manage.ts', import.meta.url), 'utf8');
    runInNewContext(transformSync(source, {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module, exports: module.exports,
        Math: Object.assign(Object.create(Math), { sum: (values: number[]) => values.reduce((sum, value) => sum + value, 0) }),
        require: (name: string) => mocks[name] || (name.startsWith('../') || name.startsWith('./') ? {} : require(name)),
    });
    let dashboardHandler: any;
    await module.exports.apply({
        Route: (name: string, path: string, handler: any) => { if (name === 'manage_dashboard') dashboardHandler = handler; },
        Connection() {},
    });
    const handler = Reflect.construct(dashboardHandler, []);
    handler.response = { body: { existing: true } };
    await assert.rejects(handler.prepare(), /Access denied/);
    assert.equal(runtimeReads, 0);
    admin = true;
    await handler.prepare();
    await handler.get();
    assert.equal(handler.response.template, 'manage_dashboard.html');
    assert.equal(handler.response.body.runtime, info);
    assert.equal(handler.response.body.existing, true);
});
