import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolveBuildIdentifier, resolveBuildTime } from '../build-identifier.ts';

test('prefers an explicitly injected Docker build identifier', () => {
    assert.equal(resolveBuildIdentifier('5.0.3', { HYDRO_BUILD_ID: 'image-abc123' }, '/missing'), 'image-abc123');
});

test('reads the identifier persisted in the image', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-build-id-'));
    const filename = path.join(directory, 'build-id');
    fs.writeFileSync(filename, 'abc123def456\n');
    try {
        assert.equal(resolveBuildIdentifier('5.0.3', { HYDRO_BUILD_ID_FILE: filename }, '/missing'), 'abc123def456');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('falls back to the Hydro version in local development', () => {
    assert.equal(resolveBuildIdentifier('5.0.3-983b279-dirty', {}, '/missing'), '5.0.3-983b279-dirty');
});

test('prefers an explicitly injected Docker build time', () => {
    assert.equal(
        resolveBuildTime({ HYDRO_BUILD_TIME: '2026-09-23T08:15:00+08:00' }, '/missing'),
        '2026-09-23T00:15:00.000Z',
    );
});

test('reads and normalizes the build time persisted in the image', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-build-time-'));
    const filename = path.join(directory, 'build-time');
    fs.writeFileSync(filename, '2026-09-23T00:15:00.000Z\n');
    try {
        assert.equal(
            resolveBuildTime({ HYDRO_BUILD_TIME_FILE: filename }, '/missing'),
            '2026-09-23T00:15:00.000Z',
        );
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
