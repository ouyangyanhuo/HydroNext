import { createHash } from 'crypto';
import { open, readFile } from 'fs/promises';

export const UPDATE_KINDS = ['asar', 'installer', 'portable', 'config'] as const;
export type UpdateKind = typeof UPDATE_KINDS[number];
export interface UpdateAsset {
    id: string; kind: UpdateKind; version: string; filename: string; size: number; sha256: string;
    bundleVersion?: string; bundleError?: string;
}
export interface UpdateDraft {
    origin: string; version: string; minClientVersion: string; description: string; changelog: string[];
    asar: string; installer: string; portable: string; config: string;
    asarFallbackUrl: string; configFallbackUrl: string;
}
export const defaultDraft: UpdateDraft = { origin: '', version: '1.0.0', minClientVersion: '1.0.0', description: '', changelog: [],
    asar: '', installer: '', portable: '', config: '', asarFallbackUrl: '', configFallbackUrl: '' };

export function updateVersion(value: unknown): string {
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,6})\.(?:0|[1-9]\d{0,6})\.(?:0|[1-9]\d{0,6})$/.test(value)) {
        throw new Error('Use a stable numeric version, for example 1.2.3.');
    }
    return value;
}

export function compareUpdateVersions(a: string, b: string) {
    const left = updateVersion(a).split('.').map(Number);
    const right = updateVersion(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
    return 0;
}

export function updateUrl(value: unknown, originOnly = false): string {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Use a complete HTTPS URL.');
    let url: URL;
    try {
        url = new URL(value);
    } catch { throw new Error('Use a complete HTTPS URL.'); }
    if ((url.protocol !== 'https:' && (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
        || url.username || url.password || url.hash || (originOnly && (url.pathname !== '/' || url.search))) {
        throw new Error('Use a complete HTTPS URL.');
    }
    return originOnly ? url.origin : url.href;
}

export function normalizeUpdateDraft(raw: any): UpdateDraft {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid update configuration.');
    const result: UpdateDraft = { ...defaultDraft, origin: updateUrl(raw.origin, true),
        version: updateVersion(raw.version), minClientVersion: updateVersion(raw.minClientVersion) };
    if (compareUpdateVersions(result.minClientVersion, result.version) > 0) throw new Error('Minimum version cannot exceed the release version.');
    if (typeof raw.description !== 'string' || raw.description.length > 2000) throw new Error('Invalid update description.');
    if (!Array.isArray(raw.changelog) || raw.changelog.length > 100
        || raw.changelog.some((line: unknown) => typeof line !== 'string' || line.length > 1000)) throw new Error('Invalid changelog.');
    result.description = raw.description.trim();
    result.changelog = raw.changelog.map((line: string) => line.trim()).filter(Boolean);
    for (const key of UPDATE_KINDS) {
        const id = raw[key] || '';
        if (typeof id !== 'string' || (id && !/^[a-f0-9]{24}$/.test(id))) throw new Error('Invalid update package.');
        result[key] = id;
    }
    for (const key of ['asarFallbackUrl', 'configFallbackUrl'] as const) result[key] = raw[key] ? updateUrl(raw[key]) : '';
    return result;
}

export function updateAssetUrl(origin: string, asset: UpdateAsset) {
    if (!/^[a-f0-9]{24}$/.test(asset.id)) throw new Error('Invalid update package.');
    return `${updateUrl(origin, true)}/client-updates/packages/${asset.id}/${encodeURIComponent(asset.filename)}`;
}

export function updateUrlAssetId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    try {
        return new URL(value).pathname.match(/^\/(?:d\/[^/]+\/)?client-updates\/packages\/([a-f0-9]{24})\/[^/]+$/)?.[1] || null;
    } catch { return null; }
}

export function activeUpdateAssets(manifest: Record<string, any> | undefined): string[] {
    return [...new Set([manifest?.hotUpdate?.asarUrl, manifest?.hotUpdate?.fallbackUrl, manifest?.config?.url,
        manifest?.config?.fallbackUrl, manifest?.fullUpdate?.installerUrl, manifest?.fullUpdate?.portableUrl]
        .map(updateUrlAssetId).filter((id): id is string => !!id))];
}

export function buildUpdateManifest(draft: UpdateDraft, assets: UpdateAsset[], releaseDate: string) {
    const manifest: Record<string, any> = { version: draft.version, minClientVersion: draft.minClientVersion,
        releaseDate, description: draft.description, changelog: draft.changelog };
    for (const kind of UPDATE_KINDS) {
        if (!draft[kind]) continue;
        const asset = assets.find((row) => row.id === draft[kind] && row.kind === kind);
        if (!asset || (kind !== 'config' && asset.version !== draft.version)) throw new Error('Package version must match the release version.');
        const url = updateAssetUrl(draft.origin, asset);
        if (kind === 'asar') {
            manifest.hotUpdate = { version: asset.version, asarUrl: url,
                fallbackUrl: draft.asarFallbackUrl, size: asset.size, sha256: asset.sha256 };
        } else if (kind === 'config') manifest.config = { version: asset.version, url, fallbackUrl: draft.configFallbackUrl };
        else manifest.fullUpdate = { ...manifest.fullUpdate, version: asset.version, [`${kind}Url`]: url };
    }
    return manifest;
}

export async function verifyUpdateStream(stream: AsyncIterable<Buffer>, asset: Pick<UpdateAsset, 'size' | 'sha256'>) {
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > asset.size) throw new Error('Update package file is missing or corrupted.');
        hash.update(chunk);
    }
    if (size !== asset.size || hash.digest('hex') !== asset.sha256) throw new Error('Update package file is missing or corrupted.');
}

// Read bounded metadata only. Never extract or execute uploaded client code.
export async function inspectUpdateFile(path: string, kind: UpdateKind, size: number, version: string) {
    const max = kind === 'config' ? 256 * 1024 : 240 * 1024 * 1024;
    if (!Number.isSafeInteger(size) || size < 1 || size > max) throw new Error('Update package is too large or empty.');
    if (kind === 'config') {
        const content = await readFile(path);
        if (content.length !== size) throw new Error('Invalid update package.');
        const config = JSON.parse(content.toString('utf8'));
        updateUrl(config?.exam?.targetUrl);
        return { bundleVersion: '', bundleError: '' };
    }
    const file = await open(path, 'r');
    try {
        if ((await file.stat()).size !== size) throw new Error('Invalid update package.');
        const prefix = Buffer.alloc(16);
        if ((await file.read(prefix, 0, 16, 0)).bytesRead !== 16) throw new Error('Invalid update package.');
        if (kind !== 'asar') {
            if (prefix.toString('ascii', 0, 2) !== 'MZ') throw new Error('Upload a Windows executable package.');
            return { bundleVersion: '', bundleError: '' };
        }
        const headerSize = prefix.readUInt32LE(4);
        const jsonSize = prefix.readUInt32LE(12);
        if (size < 10240 || prefix.readUInt32LE(0) !== 4 || headerSize > 4 * 1024 * 1024 || headerSize < 8
            || jsonSize < 2 || jsonSize > headerSize - 8 || headerSize + 8 > size
            || prefix.readUInt32LE(8) !== headerSize - 4) throw new Error('Invalid ASAR archive.');
        const buffer = Buffer.alloc(jsonSize);
        if ((await file.read(buffer, 0, jsonSize, 16)).bytesRead !== jsonSize) throw new Error('Invalid ASAR archive.');
        const tree = JSON.parse(buffer.toString('utf8'));
        const entry = tree.files?.['package.json'];
        const error = { bundleVersion: '', bundleError: 'ASAR must contain a root package.json and a valid entry point.' };
        if (!entry || entry.unpacked || entry.link || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 65536
            || typeof entry.offset !== 'string' || !/^\d{1,16}$/.test(entry.offset)) return error;
        const start = headerSize + 8 + Number(entry.offset);
        if (!Number.isSafeInteger(start) || start + entry.size > size) throw new Error('Invalid ASAR archive.');
        const metadata = Buffer.alloc(entry.size);
        if ((await file.read(metadata, 0, entry.size, start)).bytesRead !== entry.size) throw new Error('Invalid ASAR archive.');
        const pkg = JSON.parse(metadata.toString('utf8'));
        if (typeof pkg.main !== 'string' || !/^[\w./-]+\.js$/.test(pkg.main)) return error;
        const parts = pkg.main.replace(/^\.\//, '').split('/');
        if (parts.some((part: string) => !part || part === '..' || part === '.')) return error;
        let node = tree;
        for (const part of parts) node = node?.files?.[part];
        if (!node || node.link || node.unpacked || !Number.isSafeInteger(node.size) || node.size < 1
            || typeof node.offset !== 'string' || !/^\d{1,16}$/.test(node.offset)
            || headerSize + 8 + Number(node.offset) + node.size > size) return error;
        const bundleVersion = updateVersion(pkg.version);
        return { bundleVersion, bundleError: bundleVersion === version ? '' : 'Package version must match the release version.' };
    } finally {
        await file.close();
    }
}
