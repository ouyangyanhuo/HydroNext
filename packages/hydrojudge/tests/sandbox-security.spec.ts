import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { STATUS } from '../../common/status';
import { SandboxStatus } from '../src/sandbox/interface';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/sandbox.ts', import.meta.url), 'utf8');
const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
class SystemError extends Error {}
class FormatError extends Error {}

function result(extra = {}) {
    return { status: SandboxStatus.Accepted, exitStatus: 0, time: 1000000, memory: 1024, files: {}, fileIds: {}, ...extra };
}

function sandbox({ config = { fixSymlinkEscape: true } as any, results = [result()] as any, unavailable = false } = {}) {
    const errors: string[] = [];
    const deleted: string[] = [];
    const warnings: string[] = [];
    const settings = { rate: 1, memoryMax: '512m', stdio_size: '32m', env: '', processLimit: 32, parallelism: 2 };
    const mocks: Record<string, any> = {
        cac: () => ({ parse: () => ({ options: {} }) }),
        'p-queue': class {},
        '@hydrooj/common': { STATUS },
        '@hydrooj/utils/lib/sysinfo': { get: async () => ({ osinfo: { kernel: '6.8.0' } }) },
        './config': { getConfig: (key: string) => settings[key] },
        './error': { SystemError, FormatError },
        './log': { Logger: class { warn() {} } },
        './sandbox/interface': { SandboxStatus },
        './sandbox/client': {
            version: async () => {
                if (unavailable) throw Object.assign(new Error('unavailable'), { code: 'ECONNREFUSED' });
                return { buildVersion: 'v1.9.4', copyOutOptional: true };
            },
            config: async () => config,
            run: async () => results,
            deleteFile: async (id: string) => { deleted.push(id); },
        },
        './utils': { cmd: (command: string) => command.split(' '), parseMemoryMB: (value: string) => parseInt(value, 10) },
    };
    const module = { exports: {} as any };
    runInNewContext(code, {
        module, exports: module.exports, Symbol, console,
        require: (name: string) => mocks[name] ?? require(name),
    });
    return {
        run: (execute: { execute: string, time?: number, memory?: number }[] = [{ execute: '/bin/true' }], params = {}) => (
            module.exports.runPiped(execute, [], params)
        ),
        check: () => module.exports.versionCheck((message: string) => warnings.push(message), (message: string) => errors.push(message)),
        errors,
        deleted,
    };
}

for (const flag of [false, undefined, null, 'true', 1]) {
    test(`sandbox startup rejects unconfirmed symlink protection: ${String(flag)}`, async () => {
        const instance = sandbox({ config: { fixSymlinkEscape: flag } });
        assert.equal(await instance.check(), false);
        assert.equal(instance.errors.length, 1);
        assert.match(instance.errors[0], /symlink escape/);
    });
}

test('sandbox startup accepts confirmed protection and rejects an unavailable service', async () => {
    assert.equal(await sandbox().check(), true);
    assert.equal(await sandbox({ unavailable: true }).check(), false);
});

for (const [name, results] of [
    ['unknown status', [result({ status: 'Unknown' })]],
    ['missing status', [result({ status: undefined })]],
    ['missing CPU usage', [result({ time: undefined })]],
    ['negative memory usage', [result({ memory: -1 })]],
    ['non-finite CPU usage', [result({ time: Infinity })]],
    ['missing exit status', [result({ exitStatus: undefined })]],
    ['accepted result with nonzero exit', [result({ exitStatus: 1 })]],
    ['invalid output files', [result({ files: { stdout: 42 } })]],
    ['invalid cached files', [result({ fileIds: [] })]],
    ['null result', [null]],
    ['missing results', []],
    ['extra results', [result(), result()]],
    ['non-array response', { status: 'Accepted' }],
] as const) {
    test(`sandbox execution rejects ${name} instead of passing it to a checker`, async () => {
        await assert.rejects(sandbox({ results }).run(), SystemError);
    });
}

test('sandbox output-limit status is preserved as OLE', async () => {
    const [output] = await sandbox({ results: [result({ status: SandboxStatus.OutputLimitExceeded })] }).run();
    assert.equal(output.status, STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED);
});

for (const status of [SandboxStatus.InternalError, SandboxStatus.FileError]) {
    test(`sandbox ${status} aborts the whole piped execution and releases cached files`, async () => {
        const instance = sandbox({ results: [
            result({ status, fileIds: { stdout: 'failed-output' } }),
            result({ fileIds: { stdout: 'user-output', stderr: 'user-output' } }),
        ] });
        await assert.rejects(instance.run([{ execute: '/bin/true' }, { execute: '/bin/true' }]), SystemError);
        assert.deepEqual(instance.deleted, ['failed-output', 'user-output']);
    });
}

test('valid sandbox results retain their output and resource usage', async () => {
    const [output] = await sandbox({ results: [result({ files: { stdout: 'ok', stderr: '' } })] }).run();
    assert.equal(output.status, STATUS.STATUS_ACCEPTED);
    assert.equal(output.time, 1);
    assert.equal(output.memory, 1);
    assert.equal(output.stdout, 'ok');
    await output[Symbol.asyncDispose]();
});

test('piped commands are checked against their individual resource limits', async () => {
    const [time, memory] = await sandbox({ results: [result({ time: 11_000_000 }), result({ memory: 2 * 1024 * 1024 })] }).run([
        { execute: '/bin/true', time: 10, memory: 512 },
        { execute: '/bin/true', time: 1000, memory: 1 },
    ]);
    assert.equal(time.status, STATUS.STATUS_TIME_LIMIT_EXCEEDED);
    assert.equal(memory.status, STATUS.STATUS_MEMORY_LIMIT_EXCEEDED);
});

test('shared limits override individual piped command limits consistently', async () => {
    const [output] = await sandbox({ results: [result({ time: 11_000_000 })] }).run([
        { execute: '/bin/true', time: 10 },
    ], { time: 20 });
    assert.equal(output.status, STATUS.STATUS_ACCEPTED);
});

test('builtin judge refuses to register consumers when the sandbox check fails', async () => {
    const builtinSource = readFileSync(new URL('../src/hosts/builtin.ts', import.meta.url), 'utf8');
    const builtinCode = transformSync(builtinSource, { loader: 'ts', format: 'cjs' }).code;
    let injected = false;
    const mocks: Record<string, any> = {
        '@hydrooj/utils': {},
        '@hydrooj/utils/lib/sysinfo': {},
        hydrooj: {},
        'hydrooj/src/model/setting': {},
        '../config': { getConfig: () => 'full' },
        '../error': { SystemError },
        '../info': {},
        '../log': { warn() {}, error() {} },
        '../sandbox': { versionCheck: async () => false },
        '../task': {},
        '../tracing': {},
    };
    const module = { exports: {} as any };
    runInNewContext(builtinCode, { module, exports: module.exports, require: (name: string) => mocks[name] ?? require(name) });
    await assert.rejects(module.exports.apply({ inject: () => { injected = true; } }), SystemError);
    assert.equal(injected, false);
});
