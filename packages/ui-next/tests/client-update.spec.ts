import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildUpdateManifest, defaultDraft, normalizeUpdateDraft } from '../../hydrooj/src/lib/client-update.ts';
import { packageUrl, previewUpdate } from '../src/utils/client-update.ts';

test('client preview and authoritative server manifest agree on all four package types', () => {
    const kinds = ['asar', 'installer', 'portable', 'config'] as const;
    const assets = kinds.map((kind, index) => ({ id: String(index + 1).repeat(24), kind,
        version: kind === 'config' ? '1.0.0' : '1.2.3', filename: kind === 'config' ? 'exam-config.json' : `${kind}.exe`, size: 100000, sha256: 'a'.repeat(64) }));
    const draft = normalizeUpdateDraft({ ...defaultDraft, origin: 'https://oj.example/', version: '1.2.3', buildVersion: '2026101001',
        description: ' stable ', changelog: [' fix ', ''], ...Object.fromEntries(assets.map((asset) => [asset.kind, asset.id])) });
    assert.deepEqual(previewUpdate(draft, assets, 'date'), buildUpdateManifest(draft, assets, 'date'));
    assert.equal(packageUrl('javascript:alert(1)', assets[0]), '');
    assert.equal(packageUrl('/d/exam', assets[0]), '');
    assert.equal(packageUrl('https://oj.example/d/exam', assets[0]).startsWith('https://oj.example/client-updates/'), true);
});

test('URL and upload mixed previews match server manifests including buildVersion and uppercase ASAR hashes', () => {
    const asset = { id: '1'.repeat(24), kind: 'installer' as const, version: '1.0.0', filename: 'setup.exe', size: 32, sha256: 'a'.repeat(64) };
    const draft = normalizeUpdateDraft({ ...defaultDraft, origin: 'https://oj.example', buildVersion: '2026101001',
        asarUrl: 'https://cdn.example/app.asar', asarSize: 123456, asarSha256: 'A'.repeat(64),
        installer: asset.id, portableUrl: 'https://cdn.example/portable.exe', configUrl: 'https://cdn.example/config.json' });
    assert.deepEqual(previewUpdate(draft, [asset], 'date'), buildUpdateManifest(draft, [asset], 'date'));
});

test('dashboard replaces only the import card and retains user management import entry and lazy page registration', () => {
    const dashboard = readFileSync(new URL('../src/pages/manage_dashboard.tsx', import.meta.url), 'utf8');
    assert.ok(dashboard.includes("to: 'manage_client_updates'"));
    assert.ok(!dashboard.includes("to: 'manage_user_import'"));
    assert.ok(readFileSync(new URL('../src/pages/manage_user.tsx', import.meta.url), 'utf8').includes('to="manage_user_import"'));
    assert.ok(readFileSync(new URL('../src/pages/index.ts', import.meta.url), 'utf8').includes("import('./manage_client_updates')"));
});
