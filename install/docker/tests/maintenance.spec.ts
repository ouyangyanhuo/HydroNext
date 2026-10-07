import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const script = path.resolve(__dirname, '../maintenance.sh');
const image = (character: string) => `sha256:${character.repeat(64)}`;
const mockDocker = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const statePath = process.env.HYDRO_MOCK_STATE;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.calls.push(args);
const persist = () => fs.writeFileSync(statePath, JSON.stringify(state));
const finish = (output = '', code = 0) => {
    persist();
    process.stdout.write(output);
    process.exit(code);
};
if (args[0] === 'compose') {
    if (args.includes('version')) finish();
    if (args.includes('config')) finish(args.includes('--services') ? 'oj-mongo\\noj-backend\\noj-judge\\n' : '');
    if (args.includes('ps')) finish(args.at(-1) + '-container\\n');
    if (args.includes('restart')) {
        state.restarted = true;
        finish('', process.env.HYDRO_MOCK_FAILURE === 'restart' ? 1 : 0);
    }
}
if (args[0] === 'inspect') {
    const service = args.at(-1).replace('-container', '');
    if (args[2].includes('.State.Status')) {
        finish(process.env.HYDRO_MOCK_FAILURE === 'readiness' ? 'running starting\\n' : 'running healthy\\n');
    }
    finish(state.images[service] + '\\t' + service + ':latest\\t' + service + '\\n');
}
if (args[0] === 'image') {
    if (args[1] === 'tag') {
        state.tags[args[3]] = args[2];
        finish();
    }
    if (args[1] === 'save') finish('fake image archive', process.env.HYDRO_MOCK_FAILURE === 'save' ? 1 : 0);
    if (args[1] === 'inspect') finish('', state.tags[args[2]] ? 0 : 1);
    if (args[1] === 'ls') {
        if (process.env.HYDRO_MOCK_FAILURE === 'cleanup') finish('', 1);
        const tag = args.at(-1).replace('reference=', '');
        finish(state.tags[tag] ? state.tags[tag] + '\\n' : '');
    }
    if (args[1] === 'rm') {
        if (!args.at(-1).startsWith('hydro-maintenance-')) finish('refused business image deletion', 1);
        delete state.tags[args.at(-1)];
        finish();
    }
}
finish('Unexpected docker command: ' + args.join(' '), 1);
`;

function fixture() {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'hydro-maintenance-'));
    const statePath = path.join(directory, 'state.json');
    const composeFile = path.join(directory, 'docker-compose.yml');
    const backupDir = path.join(directory, 'backups');
    writeFileSync(composeFile, 'services: {}\n');
    writeFileSync(path.join(directory, 'docker'), mockDocker, { mode: 0o755 });
    writeFileSync(statePath, JSON.stringify({
        calls: [],
        images: { 'oj-mongo': image('a'), 'oj-backend': image('b'), 'oj-judge': image('b') },
        tags: { 'oj-backend:latest': image('c') },
    }));
    return {
        directory,
        backupDir,
        composeFile,
        state: () => JSON.parse(readFileSync(statePath, 'utf8')),
        run: (failure = '', mode = '--manual', backups = backupDir) => spawnSync('bash', [
            script, mode, '--compose-file', composeFile, '--backup-dir', backups, '--wait-timeout', '1',
        ], {
            env: {
                ...process.env,
                PATH: `${directory}:${process.env.PATH}`,
                HYDRO_MOCK_STATE: statePath,
                HYDRO_MOCK_FAILURE: failure,
            },
            encoding: 'utf8',
            timeout: 15000,
        }),
        clean: () => rmSync(directory, { recursive: true, force: true }),
    };
}

test('backs up actual container images once, before restart, and rotates only its own backups', () => {
    const f = fixture();
    try {
        const first = f.run();
        assert.equal(first.status, 0, first.stdout + first.stderr);
        const firstSnapshot = readdirSync(f.backupDir)[0];
        const state = f.state();
        const tagged = state.calls.filter((call: string[]) => call[0] === 'image' && call[1] === 'tag');
        assert.deepEqual(tagged.map((call: string[]) => call[2]), [image('a'), image('b')]);
        assert.ok(state.calls.findIndex((call: string[]) => call[1] === 'save')
            < state.calls.findIndex((call: string[]) => call.includes('restart')));
        assert.ok(readFileSync(path.join(f.backupDir, firstSnapshot, 'containers.tsv'), 'utf8').includes(image('b')));
        assert.ok(readFileSync(path.join(f.backupDir, firstSnapshot, 'images.tar.gz')).length > 0);
        writeFileSync(path.join(f.backupDir, 'unrelated.tar'), 'keep me');
        const second = f.run('', '--scheduled');
        assert.equal(second.status, 0, second.stdout + second.stderr);
        assert.equal(readdirSync(f.backupDir).filter((name) => name.startsWith('snapshot-')).length, 1);
        assert.ok(!readdirSync(f.backupDir).includes(firstSnapshot));
        assert.equal(readFileSync(path.join(f.backupDir, 'unrelated.tar'), 'utf8'), 'keep me');
        assert.equal(f.state().tags['oj-backend:latest'], image('c'));
        assert.equal(Object.keys(f.state().tags).filter((tag) => tag.startsWith('hydro-maintenance-')).length, 2);
    } finally {
        f.clean();
    }
});

test('backup failure does not restart containers or delete the previous backup', () => {
    const f = fixture();
    try {
        assert.equal(f.run().status, 0);
        const before = readdirSync(f.backupDir);
        const callCount = f.state().calls.length;
        assert.notEqual(f.run('save').status, 0);
        assert.deepEqual(readdirSync(f.backupDir), before);
        assert.ok(!f.state().calls.slice(callCount).some((call: string[]) => call.includes('restart')));
        assert.equal(Object.keys(f.state().tags).filter((tag) => tag.startsWith('hydro-maintenance-')).length, 2);
    } finally {
        f.clean();
    }
});

for (const failure of ['restart', 'readiness']) {
    test(`${failure} failure retains both the previous and newly exported backup`, () => {
        const f = fixture();
        try {
            assert.equal(f.run().status, 0);
            const previous = readdirSync(f.backupDir)[0];
            assert.notEqual(f.run(failure).status, 0);
            assert.ok(readdirSync(f.backupDir).includes(previous));
            assert.equal(readdirSync(f.backupDir).filter((name) => name.startsWith('snapshot-')).length, 2);
        } finally {
            f.clean();
        }
    });
}

test('refuses overlapping runs even with different backup directories', () => {
    const f = fixture();
    try {
        const lock = `${f.composeFile}.maintenance.lock`;
        const result = spawnSync('flock', ['--nonblock', lock, 'bash', script, '--manual', '--compose-file', f.composeFile,
            '--backup-dir',
            path.join(f.directory, 'alternate-backups')], {
            env: {
                ...process.env,
                PATH: `${f.directory}:${process.env.PATH}`,
                HYDRO_MOCK_STATE: path.join(f.directory, 'state.json'),
            },
            encoding: 'utf8',
            timeout: 15000,
        });
        assert.equal(result.status, 75, result.stdout + result.stderr);
        assert.ok(readFileSync(lock).length === 0);
        assert.equal(f.state().calls.length, 0);
    } finally {
        f.clean();
    }
});

test('Docker query failure during cleanup preserves the previous archive', () => {
    const f = fixture();
    try {
        assert.equal(f.run().status, 0);
        const previous = readdirSync(f.backupDir)[0];
        const result = f.run('cleanup');
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.ok(readdirSync(f.backupDir).includes(previous));
        assert.equal(readdirSync(f.backupDir).filter((name) => name.startsWith('snapshot-')).length, 2);
    } finally {
        f.clean();
    }
});
