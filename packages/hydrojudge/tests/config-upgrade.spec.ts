import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/cases.ts', import.meta.url), 'utf8');
const code = transformSync(`${source}\nexport { isValidConfig };`, { loader: 'ts', format: 'cjs' }).code;
const module = { exports: {} as any };
const mocks: Record<string, any> = {
    '@hydrooj/common': {}, '@hydrooj/common/cases': {}, '@hydrooj/utils': {},
    './config': { getConfig: (key: string) => ({ testcases_max: 100, total_time_limit: 60, processLimit: 32, memoryMax: '1024m' })[key] },
    './error': { FormatError: Error, SystemError: Error },
    './utils': { parseMemoryMB: () => 1024 },
};
runInNewContext(code, {
    module, exports: module.exports, require: (name: string) => mocks[name] || require(name),
    Math: Object.assign(Object.create(Math), { sum: (...values: number[]) => values.reduce((sum, value) => sum + value, 0) }),
});
const validate = module.exports.isValidConfig;
const fixture = (extra: any = {}) => ({
    type: 'default', count: 1, checker_type: 'default',
    subtasks: [{ cases: [{ time: 1000, memory: 64 }] }], ...extra,
});

test('ordinary problems cannot bypass total time limits when num_processes is omitted', () => {
    assert.doesNotThrow(() => validate(fixture()));
    assert.throws(() => validate(fixture({ subtasks: [{ cases: [{ time: 61_000, memory: 64 }] }] })), /Total time limit/);
});

test('communication problems default to two processes and validate aggregate resources', () => {
    const config = fixture({ type: 'communication' });
    validate(config);
    assert.equal(config.num_processes, 2);
    assert.throws(() => validate(fixture({ type: 'communication', num_processes: 0 })), /positive integer/);
    assert.throws(() => validate(fixture({ type: 'communication', num_processes: 1.5 })), /positive integer/);
    assert.throws(() => validate(fixture({ type: 'communication', num_processes: 33 })), /processLimit/);
    assert.throws(() => validate(fixture({
        type: 'communication', subtasks: [{ cases: [{ time: 31_000, memory: 64 }] }],
    })), /Total time limit/);
});

test('multi-pass validates pass counts, problem types and compatible checker requirements', () => {
    assert.doesNotThrow(() => validate(fixture({ multi_pass: 2, checker_type: 'testlib', checker: 'checker.cpp' })));
    assert.doesNotThrow(() => validate(fixture({ type: 'interactive', multi_pass: 2, interactor: 'interactor.cpp' })));
    assert.throws(() => validate(fixture({ multi_pass: 1 })), /between 2 and 20/);
    assert.throws(() => validate(fixture({ multi_pass: 21 })), /between 2 and 20/);
    assert.throws(() => validate(fixture({ type: 'submit_answer', multi_pass: 2 })), /only supported/);
    assert.throws(() => validate(fixture({ multi_pass: 2 })), /requires a testlib or kattis/);
});
