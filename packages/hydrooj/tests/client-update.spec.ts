import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import {
    activeUpdateAssets, buildUpdateManifest, compareUpdateVersions, defaultDraft, inspectUpdateFile, normalizeUpdateDraft,
    updateAssetUrl, updateUrl, updateVersion, verifyUpdateStream,
} from '../src/lib/client-update.ts';

const id = '0123456789abcdef01234567';
const draft = { ...defaultDraft, origin: 'https://oj.example', version: '1.2.3', minClientVersion: '1.0.0',
    description: ' Stable ', changelog: ['Fix'], asar: id };
const asset = { id, kind: 'asar' as const, version: '1.2.3', filename: 'app.asar', size: 25000, sha256: 'a'.repeat(64) };

test('active package protection deduplicates primary and fallback references without trusting arbitrary URLs', () => {
    const url = `https://oj.example/client-updates/packages/${id}/app.asar`;
    assert.deepEqual(activeUpdateAssets({ hotUpdate: { asarUrl: url, fallbackUrl: url }, config: { url: 'bad URL' } }), [id]);
    assert.deepEqual(activeUpdateAssets({ config: { url: `https://oj.example/d/exam/client-updates/packages/${id}/exam-config.json` } }), [id]);
    assert.deepEqual(activeUpdateAssets(undefined), []);
});

test('publication verifies actual stored bytes with a bounded streamed hash before exposing the release', async () => {
    const content = Buffer.from('client package');
    const expected = { size: content.length, sha256: createHash('sha256').update(content).digest('hex') };
    await verifyUpdateStream(Readable.from([content.subarray(0, 4), content.subarray(4)]), expected);
    await assert.rejects(verifyUpdateStream(Readable.from([Buffer.from('client damaged')]), expected));
    await assert.rejects(verifyUpdateStream(Readable.from([content.subarray(1)]), expected));
    await assert.rejects(verifyUpdateStream(Readable.from([content, content]), expected));
});

test('version validation matches the numeric client comparison and rejects ambiguous versions', () => {
    assert.equal(compareUpdateVersions('1.10.0', '1.9.99'), 1);
    assert.equal(compareUpdateVersions('1.0.0', '1.0.0'), 0);
    assert.equal(compareUpdateVersions('1.0.0', '2.0.0'), -1);
    for (const value of ['v1.0.0', '1.0.0-beta', '1.0', '01.0.0', '1.0.0.0', '1.10000000.0', '', null]) {
        assert.throws(() => updateVersion(value));
    }
});

test('URLs reject non-HTTPS remote origins, credentials, path prefixes and unsafe protocols', () => {
    assert.equal(updateUrl('https://oj.example/', true), 'https://oj.example');
    assert.equal(updateUrl('http://localhost:2333', true), 'http://localhost:2333');
    assert.equal(updateUrl('https://cdn.example/app.asar?build=3'), 'https://cdn.example/app.asar?build=3');
    for (const url of ['http://oj.example', 'file:///etc/passwd', 'javascript:alert(1)', '/app.asar',
        'https://user:password@oj.example', 'https://oj.example/#secret', 'https://oj.example/d/exam', 'https://oj.example?x=1']) {
        assert.throws(() => updateUrl(url, true));
    }
});

test('manifest uses immutable global absolute URLs and the exact client fields', () => {
    const normalized = normalizeUpdateDraft(draft);
    const manifest = buildUpdateManifest(normalized, [asset], '2026-10-10T00:00:00.000Z');
    assert.equal(manifest.description, 'Stable');
    assert.equal(manifest.hotUpdate.asarUrl, `https://oj.example/client-updates/packages/${id}/app.asar`);
    assert.equal(manifest.hotUpdate.sha256, asset.sha256);
    assert.equal(manifest.hotUpdate.size, 25000);
    assert.equal(manifest.fullUpdate, undefined);
    assert.equal(manifest.config, undefined);
    assert.equal(updateAssetUrl('https://oj.example', { ...asset, filename: '客户端.exe' }).includes('%E5'), true);
    assert.throws(() => buildUpdateManifest(normalized, [{ ...asset, version: '1.2.2' }], 'date'));
    assert.throws(() => buildUpdateManifest(normalized, [], 'date'));
});

test('installer, portable and configuration metadata can be combined without overwriting fields', () => {
    const ids = ['1'.repeat(24), '2'.repeat(24), '3'.repeat(24)];
    const values = [
        { ...asset, id: ids[0], kind: 'installer' as const, filename: 'installer.exe' },
        { ...asset, id: ids[1], kind: 'portable' as const, filename: 'portable.exe' },
        { ...asset, id: ids[2], kind: 'config' as const, filename: 'exam-config.json', version: '1.0.0' },
    ];
    const manifest = buildUpdateManifest({ ...draft, asar: '', installer: ids[0], portable: ids[1], config: ids[2] }, values, 'date');
    assert.ok(manifest.fullUpdate.installerUrl.endsWith('/installer.exe'));
    assert.ok(manifest.fullUpdate.portableUrl.endsWith('/portable.exe'));
    assert.equal(manifest.fullUpdate.version, '1.2.3');
    assert.equal(manifest.config.version, '1.0.0');
});

test('draft validation bounds text and selections and does not persist arbitrary submitted properties', () => {
    assert.equal('privateKey' in normalizeUpdateDraft({ ...draft, privateKey: 'secret' }), false);
    for (const extra of [{ changelog: 'text' }, { changelog: Array.from({ length: 101 }).fill('x') }, { description: 'x'.repeat(2001) },
        { minClientVersion: '2.0.0' }, { asar: '../../file' }, { asarFallbackUrl: 'http://evil.example/app.asar' }]) {
        assert.throws(() => normalizeUpdateDraft({ ...draft, ...extra }));
    }
});

function archive(version = '1.2.3', main = 'app/main/index.js', withPackage = true) {
    const pkg = Buffer.from(JSON.stringify({ version, main }));
    const tree = { files: {
        ...(withPackage ? { 'package.json': { size: pkg.length, offset: '0' } } : {}),
        app: { files: { main: { files: { 'index.js': { size: 10, offset: String(pkg.length) } } } } },
    } };
    const json = Buffer.from(JSON.stringify(tree));
    const header = Buffer.alloc(Math.ceil((json.length + 8) / 4) * 4);
    header.writeUInt32LE(header.length - 4, 0);
    header.writeUInt32LE(json.length, 4);
    json.copy(header, 8);
    const size = Buffer.alloc(8);
    size.writeUInt32LE(4, 0);
    size.writeUInt32LE(header.length, 4);
    return Buffer.concat([size, header, pkg, Buffer.alloc(12000)]);
}

test('ASAR validation detects the existing client packaging bug and version/entry-point errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hydro-update-'));
    try {
        const path = join(directory, 'app.asar');
        for (const [buffer, expected] of [[archive(), ''], [archive('1.2.2'), 'version'], [archive('1.2.3', '../outside.js'), 'entry'],
            [archive('1.2.3', 'missing.js'), 'entry'], [archive('1.2.3', 'app/main/index.js', false), 'entry']] as const) {
            // eslint-disable-next-line no-await-in-loop
            await writeFile(path, buffer);
            // eslint-disable-next-line no-await-in-loop
            const result = await inspectUpdateFile(path, 'asar', buffer.length, '1.2.3');
            assert.equal(expected ? result.bundleError.includes(expected === 'entry' ? 'entry point' : 'version') : !result.bundleError, true);
        }
        const buffer = archive();
        buffer.writeUInt32LE(0xFFFFFFFF, 4);
        await writeFile(path, buffer);
        await assert.rejects(inspectUpdateFile(path, 'asar', buffer.length, '1.2.3'));
        await writeFile(path, Buffer.alloc(12000));
        await assert.rejects(inspectUpdateFile(path, 'asar', 12000, '1.2.3'));
        await assert.rejects(inspectUpdateFile(path, 'asar', 241 * 1024 * 1024, '1.2.3'));
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('config and executable uploads are validated without executing code or fetching remote addresses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hydro-update-'));
    try {
        const path = join(directory, 'file');
        const config = Buffer.from('{"exam":{"targetUrl":"https://oj.example/d/exam/"}}');
        await writeFile(path, config);
        await inspectUpdateFile(path, 'config', config.length, '1.0.0');
        const invalid = Buffer.from('{"exam":{"targetUrl":"file:///etc/passwd"}}');
        await writeFile(path, invalid);
        await assert.rejects(inspectUpdateFile(path, 'config', invalid.length, '1.0.0'));
        await writeFile(path, Buffer.alloc(32));
        await assert.rejects(inspectUpdateFile(path, 'installer', 32, '1.0.0'));
        const exe = Buffer.alloc(32);
        exe.write('MZ');
        await writeFile(path, exe);
        await inspectUpdateFile(path, 'portable', 32, '1.0.0');
    } finally { await rm(directory, { recursive: true, force: true }); }
});
