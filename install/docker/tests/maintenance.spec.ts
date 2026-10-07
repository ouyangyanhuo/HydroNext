import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const maintenance = path.resolve(__dirname, '../maintenance.sh');
const restore = path.resolve(__dirname, '../restore.sh');
const image = (character: string) => `sha256:${character.repeat(64)}`;
const mockDocker = `#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const statePath = process.env.HYDRO_MOCK_STATE;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const failure = process.env.HYDRO_MOCK_FAILURE;
state.calls.push(args);
const finish = (output = '', code = 0) => {
    fs.writeFileSync(statePath, JSON.stringify(state));
    process.stdout.write(output);
    process.exit(code);
};
if (args[0] === 'compose') {
    const file = args[args.indexOf('-f') + 1];
    const configuredImage = () => fs.readFileSync(file, 'utf8').match(/image: (docker-oj-backend:[\\w.-]+)/)[1];
    if (args.includes('config')) {
        finish(args.includes('json') ? JSON.stringify({ services: { 'oj-backend': { image: configuredImage() } } }) : '');
    }
    if (args.includes('ps')) {
        if (args.at(-1) === 'oj-backend') finish(failure === 'missing-backend' ? '' : 'oj-backend-container\\n');
        finish('oj-mongo-container\\noj-backend-container\\noj-judge-container\\n');
    }
    if (args.includes('stop')) {
        state.status = failure === 'stop-lies' ? 'running' : 'exited';
        finish();
    }
    if (args.includes('start')) {
        state.status = 'running';
        finish('', failure === 'start' ? 1 : 0);
    }
    if (args.includes('up')) {
        if (failure === 'up') finish('', 1);
        state.status = 'running';
        state.backendImage = state.tags[configuredImage()];
        finish();
    }
}
if (args[0] === 'inspect') finish(args[2].includes('.State.Status') ? state.status : state.backendImage);
if (args[0] === 'image') {
    if (args[1] === 'tag') {
        state.tags[args[3]] = args[2];
        finish();
    }
    if (args[1] === 'save') {
        if (failure === 'save') finish('', 1);
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-docker-save-'));
        fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify([
            { RepoTags: [args.at(-1)], Config: state.tags[args.at(-1)].slice(7) + '.json' },
        ]));
        const result = spawnSync('/bin/tar', ['-cf', args[args.indexOf('--output') + 1], '-C', directory, 'manifest.json']);
        fs.rmSync(directory, { recursive: true });
        finish('', result.status);
    }
    if (args[1] === 'load') {
        if (failure === 'load') finish('', 1);
        const result = spawnSync('/bin/tar', ['-xOf', args[args.indexOf('--input') + 1], 'manifest.json'], { encoding: 'utf8' });
        const manifest = JSON.parse(result.stdout)[0];
        state.tags[manifest.RepoTags[0]] = 'sha256:' + manifest.Config.replace('.json', '');
        finish();
    }
    if (args[1] === 'inspect') finish(state.tags[args.at(-1)] || '', state.tags[args.at(-1)] ? 0 : 1);
    if (args[1] === 'ls') {
        const prefix = args.at(-1).replace('reference=', '').replace(/\\*$/, '');
        finish(Object.keys(state.tags).filter((tag) => tag.startsWith(prefix)).join('\\n'));
    }
    if (args[1] === 'rm') {
        if (!args.at(-1).startsWith('docker-oj-backend:backup-') && !args.at(-1).startsWith('hydro-maintenance-')) {
            finish('refused business tag deletion', 1);
        }
        delete state.tags[args.at(-1)];
        finish();
    }
}
finish('Unexpected docker command: ' + args.join(' '), 1);
`;

const mockCopy = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.HYDRO_MOCK_STATE, 'utf8'));
if (args.includes(process.env.HYDRO_MOCK_PROJECT + '/data')) {
    state.calls.push(['copy-data', state.status]);
    fs.writeFileSync(process.env.HYDRO_MOCK_STATE, JSON.stringify(state));
    if (state.status !== 'exited' || process.env.HYDRO_MOCK_FAILURE === 'copy') process.exit(1);
}
const result = spawnSync('/bin/cp', args, { stdio: 'inherit' });
process.exit(result.status);
`;

function fixture() {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'hydro-maintenance-'));
    const statePath = path.join(directory, 'state.json');
    const composeFile = path.join(directory, 'docker-compose.yml');
    const backupDir = path.join(directory, 'backup-file');
    mkdirSync(path.join(directory, 'data/mongo'), { recursive: true });
    writeFileSync(path.join(directory, 'data/mongo/value'), 'original database');
    writeFileSync(composeFile, '# original config\nservices:\n  oj-backend:\n    image: docker-oj-backend:latest\n');
    writeFileSync(path.join(directory, 'judge.yaml'), 'original judge config');
    writeFileSync(path.join(directory, 'mount.yaml'), 'original mount config');
    writeFileSync(path.join(directory, 'docker'), mockDocker, { mode: 0o755 });
    writeFileSync(path.join(directory, 'cp'), mockCopy, { mode: 0o755 });
    writeFileSync(statePath, JSON.stringify({
        calls: [], status: 'running', backendImage: image('b'),
        tags: { 'docker-oj-backend:latest': image('c'), 'mongo:7-jammy': image('a'), 'docker-oj-judge:latest': image('d') },
    }));
    const env = {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        HYDRO_MOCK_STATE: statePath,
        HYDRO_MOCK_PROJECT: directory,
    };
    const run = (script: string, mode: string, failure = '', extra: string[] = []) => spawnSync('bash', [
        script, mode, '--compose-file', composeFile, '--wait-timeout', '1', ...extra,
    ], { env: { ...env, HYDRO_MOCK_FAILURE: failure }, encoding: 'utf8', timeout: 15000 });
    return {
        directory, backupDir, composeFile, statePath, env,
        state: () => JSON.parse(readFileSync(statePath, 'utf8')),
        backup: (failure = '', extra: string[] = []) => run(maintenance, '--manual', failure, extra),
        restore: (mode: string, failure = '') => run(restore, mode, failure),
        clean: () => rmSync(directory, { recursive: true, force: true }),
    };
}

test('flat backup exports only actual backend image, removes the temporary tag, and copies stopped data', () => {
    const f = fixture();
    try {
        const result = f.backup();
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const files = readdirSync(f.backupDir);
        const archive = files.find((name) => name.endsWith('.tar'))!;
        assert.deepEqual(files.filter((name) => name !== archive).sort(), [
            '.hydro-backup', 'data', 'docker-compose.yml', 'judge.yaml', 'mount.yaml',
        ]);
        const tar = spawnSync('tar', ['-xOf', path.join(f.backupDir, archive), 'manifest.json'], { encoding: 'utf8' });
        const manifest = JSON.parse(tar.stdout)[0];
        assert.equal(manifest.Config, `${'b'.repeat(64)}.json`);
        assert.match(manifest.RepoTags[0], /^docker-oj-backend:backup-/);
        assert.deepEqual(Object.keys(f.state().tags).sort(), ['docker-oj-backend:latest', 'docker-oj-judge:latest', 'mongo:7-jammy']);
        assert.equal(f.state().tags['docker-oj-backend:latest'], image('c'));
        assert.equal(readFileSync(path.join(f.backupDir, 'data/mongo/value'), 'utf8'), 'original database');
        assert.ok(f.state().calls.some((call: string[]) => call[0] === 'copy-data' && call[1] === 'exited'));
        assert.equal(f.state().status, 'running');
    } finally { f.clean(); }
});

test('the next successful backup replaces the old tar and data in the same directory', () => {
    const f = fixture();
    try {
        assert.equal(f.backup().status, 0);
        const previous = readdirSync(f.backupDir).find((name) => name.endsWith('.tar'))!;
        writeFileSync(path.join(f.directory, 'data/mongo/value'), 'new database');
        assert.equal(f.backup().status, 0);
        assert.ok(!existsSync(path.join(f.backupDir, previous)));
        assert.equal(readFileSync(path.join(f.backupDir, 'data/mongo/value'), 'utf8'), 'new database');
        assert.ok(!existsSync(`${f.backupDir}.previous`));
    } finally { f.clean(); }
});

for (const failure of ['save', 'copy', 'start', 'stop-lies']) {
    test(`${failure} failure retains the previous backup and removes temporary image tags`, () => {
        const f = fixture();
        try {
            assert.equal(f.backup().status, 0);
            const previous = readdirSync(f.backupDir);
            const result = f.backup(failure);
            assert.notEqual(result.status, 0);
            assert.deepEqual(readdirSync(f.backupDir), previous);
            assert.ok(!Object.keys(f.state().tags).some((tag) => tag.includes(':backup-')));
            assert.equal(f.state().status, 'running');
        } finally { f.clean(); }
    });
}

test('missing backend fails before services stop', () => {
    const f = fixture();
    try {
        assert.notEqual(f.backup('missing-backend').status, 0);
        assert.ok(!f.state().calls.some((call: string[]) => call.includes('stop')));
    } finally { f.clean(); }
});

test('image-only restore recreates backend with archived image and preserves current files', () => {
    const f = fixture();
    try {
        assert.equal(f.backup().status, 0);
        writeFileSync(path.join(f.directory, 'data/mongo/value'), 'current database');
        writeFileSync(path.join(f.directory, 'judge.yaml'), 'current judge config');
        const count = f.state().calls.length;
        const result = f.restore('--image');
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(f.state().backendImage, image('b'));
        assert.equal(readFileSync(path.join(f.directory, 'data/mongo/value'), 'utf8'), 'current database');
        assert.equal(readFileSync(path.join(f.directory, 'judge.yaml'), 'utf8'), 'current judge config');
        const calls = f.state().calls.slice(count);
        assert.ok(!calls.some((call: string[]) => call.includes('stop')));
        const up = calls.find((call: string[]) => call.includes('up'));
        assert.ok(up.includes('--no-deps') && up.includes('--force-recreate'));
        assert.equal(up.at(-1), 'oj-backend');
        assert.ok(!Object.keys(f.state().tags).some((tag) => tag.includes(':backup-')));
    } finally { f.clean(); }
});

test('full restore replaces data and configuration and recreates all bind-mounted containers', () => {
    const f = fixture();
    try {
        assert.equal(f.backup().status, 0);
        writeFileSync(path.join(f.directory, 'data/mongo/value'), 'current database');
        writeFileSync(path.join(f.directory, 'data/stale-file'), 'must not survive restore');
        writeFileSync(path.join(f.directory, 'judge.yaml'), 'current judge config');
        writeFileSync(f.composeFile, '# new config\nservices:\n  oj-backend:\n    image: docker-oj-backend:newer\n');
        writeFileSync(path.join(f.directory, '.env'), 'ADDED_AFTER_BACKUP=true\n');
        const result = f.restore('--all');
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(readFileSync(path.join(f.directory, 'data/mongo/value'), 'utf8'), 'original database');
        assert.ok(!existsSync(path.join(f.directory, 'data/stale-file')));
        assert.equal(readFileSync(path.join(f.directory, 'judge.yaml'), 'utf8'), 'original judge config');
        assert.ok(readFileSync(f.composeFile, 'utf8').includes('# original config'));
        assert.ok(!existsSync(path.join(f.directory, '.env')));
        const up = f.state().calls.find((call: string[]) => call.includes('up'));
        assert.ok(up.includes('--force-recreate') && !up.includes('--no-deps'));
        assert.equal(f.state().backendImage, image('b'));
        assert.ok(!readdirSync(f.directory).some((name) => name.startsWith('restore-previous-')));
    } finally { f.clean(); }
});

test('successful backup removes only legacy tags for the current Compose path', () => {
    const f = fixture();
    try {
        const repository = `hydro-maintenance-${createHash('sha256').update(f.composeFile).digest('hex').slice(0, 16)}`;
        const state = f.state();
        state.tags[`${repository}:old`] = image('b');
        state.tags['hydro-maintenance-other-project:old'] = image('a');
        writeFileSync(f.statePath, JSON.stringify(state));
        assert.equal(f.backup().status, 0);
        assert.ok(!f.state().tags[`${repository}:old`]);
        assert.equal(f.state().tags['hydro-maintenance-other-project:old'], image('a'));
    } finally { f.clean(); }
});

test('full restore stops existing project containers even when the live Compose file is missing', () => {
    const f = fixture();
    try {
        assert.equal(f.backup().status, 0);
        rmSync(f.composeFile);
        const count = f.state().calls.length;
        const result = f.restore('--all');
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const stop = f.state().calls.slice(count).find((call: string[]) => call.includes('stop'));
        assert.ok(stop.includes('--project-directory'));
        assert.ok(existsSync(f.composeFile));
    } finally { f.clean(); }
});

test('failed image import leaves live data and services untouched', () => {
    const f = fixture();
    try {
        assert.equal(f.backup().status, 0);
        const count = f.state().calls.length;
        writeFileSync(path.join(f.directory, 'data/mongo/value'), 'current database');
        assert.notEqual(f.restore('--all', 'load').status, 0);
        assert.equal(readFileSync(path.join(f.directory, 'data/mongo/value'), 'utf8'), 'current database');
        assert.ok(!f.state().calls.slice(count).some((call: string[]) => call.includes('stop')));
    } finally { f.clean(); }
});

test('failed full restore startup retains the original data and config for recovery', () => {
    const f = fixture();
    try {
        assert.equal(f.backup().status, 0);
        writeFileSync(path.join(f.directory, 'data/mongo/value'), 'current database');
        assert.notEqual(f.restore('--all', 'up').status, 0);
        const previous = readdirSync(f.directory).find((name) => name.startsWith('restore-previous-'))!;
        assert.equal(readFileSync(path.join(f.directory, previous, 'data/mongo/value'), 'utf8'), 'current database');
        assert.ok(existsSync(path.join(f.directory, previous, 'docker-compose.yml')));
        assert.ok(!Object.keys(f.state().tags).some((tag) => tag.includes(':backup-')));
    } finally { f.clean(); }
});

test('backup and restore share the same exclusive project lock', () => {
    const f = fixture();
    try {
        assert.equal(f.backup().status, 0);
        for (const [script, mode] of [[maintenance, '--manual'], [restore, '--image']]) {
            const count = f.state().calls.length;
            const result = spawnSync('flock', ['--nonblock', `${f.composeFile}.maintenance.lock`,
                'bash', script, mode, '--compose-file', f.composeFile], {
                env: f.env, encoding: 'utf8', timeout: 15000,
            });
            assert.equal(result.status, 75, result.stdout + result.stderr);
            assert.equal(f.state().calls.length, count);
        }
    } finally { f.clean(); }
});
