import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolveBuildIdentifier } from '../build-identifier.ts';

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
