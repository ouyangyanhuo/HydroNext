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

function sandbox({ config = { fixSymlinkEscape: true } as any, results = [result()] as any, unavailable = false } = {}) {
    const errors: string[] = [];
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
            deleteFile: async () => {},
        },
        './utils': { cmd: (command: string) => command.split(' '), parseMemoryMB: (value: string) => parseInt(value, 10) },
    };
    const module = { exports: {} as any };
    runInNewContext(code, {
        module, exports: module.exports, Symbol, console,
        require: (name: string) => mocks[name] ?? require(name),
    });
    return {
        run: (execute = [{ execute: '/bin/true' }], params = {}) => module.exports.runPiped(execute, [], params),
        check: () => module.exports.versionCheck((message: string) => warnings.push(message), (message: string) => errors.push(message)),
        errors,
    };
}

function result(extra = {}) {
    return { status: SandboxStatus.Accepted, exitStatus: 0, time: 1000000, memory: 1024, files: {}, fileIds: {}, ...extra };
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

test('valid sandbox results retain their output and resource usage', async () => {
    const [output] = await sandbox({ results: [result({ files: { stdout: 'ok', stderr: '' } })] }).run();
    assert.equal(output.status, STATUS.STATUS_ACCEPTED);
    assert.equal(output.time, 1);
    assert.equal(output.memory, 1);
    assert.equal(output.stdout, 'ok');
    await output[Symbol.asyncDispose]();
});
