import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { test } from 'node:test';
import { STATUS } from '../../common/status';
import signals from '../src/signals';

const require = createRequire(import.meta.url);

function loadSource(filename: string, mocks: Record<string, unknown>) {
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
    const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
    const module = { exports: {} as any };
    runInNewContext(code, {
        module,
        exports: module.exports,
        require: (name: string) => mocks[name] ?? require(name),
        Symbol,
    });
    return module.exports;
}

const common = { '@hydrooj/common': { STATUS } };
const testlib = loadSource('../src/testlib.ts', common);
const testcase = { id: 1, time: 1000, memory: 64, score: 100, input: '/test.in', output: '/test.out' };
const details = ['full', 'case', 'none'] as const;
const scenarios = [
    { name: 'nonzero user exit', code: 1, expected: STATUS.STATUS_RUNTIME_ERROR, score: 0 },
    { name: 'user signal', code: 11, signalled: true, expected: STATUS.STATUS_RUNTIME_ERROR, score: 0 },
    { name: 'broken pipe with successful interactor', code: 13, signalled: true, expected: STATUS.STATUS_RUNTIME_ERROR, score: 0 },
    {
        name: 'broken pipe after interactor rejection', code: 13, signalled: true,
        interactorCode: 1, stderr: 'wrong answer rejected', expected: STATUS.STATUS_WRONG_ANSWER, score: 0,
    },
    { name: 'accepted interaction', code: 0, expected: STATUS.STATUS_ACCEPTED, score: 100 },
    { name: 'interactor rejection', code: 0, interactorCode: 1, stderr: 'wrong answer rejected', expected: STATUS.STATUS_WRONG_ANSWER, score: 0 },
    { name: 'partial credit', code: 0, interactorCode: 7, stderr: 'points 0.5 partial credit', expected: STATUS.STATUS_WRONG_ANSWER, score: 50 },
    { name: 'time limit takes precedence', code: 1, time: 1001, expected: STATUS.STATUS_TIME_LIMIT_EXCEEDED, score: 0 },
    { name: 'memory limit takes precedence', code: 1, memory: 65537, expected: STATUS.STATUS_MEMORY_LIMIT_EXCEEDED, score: 0 },
];

for (const scenario of scenarios) {
    for (const detail of details) {
        test(`interactive ${scenario.name} with detail=${detail}`, async () => {
            const interactive = loadSource('../src/judge/interactive.ts', {
                ...common,
                '../flow': {
                    runFlow: async (ctx, task) => task.judgeCase(testcase)(ctx, { subtask: { id: 1 } }),
                },
                '../sandbox': {
                    runPiped: async () => [
                        {
                            code: scenario.code,
                            signalled: scenario.signalled ?? false,
                            time: scenario.time ?? 1,
                            memory: scenario.memory ?? 1,
                        },
                        {
                            code: scenario.interactorCode ?? 0,
                            stderr: scenario.stderr ?? 'ok accepted',
                            fileIds: {},
                            [Symbol.asyncDispose]: async () => {},
                        },
                    ],
                },
                '../signals': { default: signals, __esModule: true },
                '../testlib': testlib,
            });
            const result = await interactive.judge({
                session: { getLang: () => ({}) },
                config: { detail },
                executeUser: { execute: './user', copyIn: {} },
                executeInteractor: { execute: './interactor', copyIn: {} },
                env: {},
                rid: 'test',
            });

            assert.equal(result.status, scenario.expected);
            assert.equal(result.score, scenario.score);
            if (scenario.expected === STATUS.STATUS_RUNTIME_ERROR) {
                if (detail !== 'full') assert.equal(result.message, '');
                else if (scenario.signalled) assert.equal(result.message, signals[scenario.code]);
                else {
                    assert.equal(result.message.message, 'Your program returned {0}.');
                    assert.equal(result.message.params[0], scenario.code);
                }
            }
        });
    }
}
