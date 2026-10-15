import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const entrypoint = fileURLToPath(new URL('../../../install/docker/judge/entrypoint.sh', import.meta.url));

function run(startStatus = 0, runtimeStatus = 0) {
    const directory = mkdtempSync(path.join(tmpdir(), 'hydro-judge-entrypoint-'));
    const trace = path.join(directory, 'trace');
    try {
        writeFileSync(path.join(directory, 'pm2'), `#!/bin/sh
printf '%s\\n' "$*" >> "$JUDGE_SECURITY_TRACE"
umask >> "$JUDGE_SECURITY_TRACE"
exit ${startStatus}
`, { mode: 0o700 });
        writeFileSync(path.join(directory, 'pm2-runtime'), `#!/bin/sh
printf 'runtime: %s\\n' "$*" >> "$JUDGE_SECURITY_TRACE"
exit ${runtimeStatus}
`, { mode: 0o700 });
        const process = spawnSync('/bin/sh', [entrypoint], {
            env: { ...global.process.env, PATH: `${directory}:${global.process.env.PATH}`, JUDGE_SECURITY_TRACE: trace },
            encoding: 'utf8',
        });
        assert.ifError(process.error);
        return { status: process.status, trace: readFileSync(trace, 'utf8') };
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

test('judge container starts a loopback-only sandbox with private file permissions', () => {
    const output = run();
    assert.equal(output.status, 0);
    assert.match(output.trace, /-http-addr=127\.0\.0\.1:5050/);
    assert.match(output.trace, /\n0*77\n/);
    assert.match(output.trace, /runtime: start hydrojudge/);
});

test('judge container does not continue when sandbox supervision fails to start', () => {
    const output = run(17);
    assert.equal(output.status, 17);
    assert.doesNotMatch(output.trace, /runtime:/);
});

test('judge container propagates the runtime exit status', () => {
    assert.equal(run(0, 23).status, 23);
});
