export const UPDATE_KINDS = ['asar', 'installer', 'portable', 'config'] as const;
export type UpdateKind = typeof UPDATE_KINDS[number];
export interface UpdateAsset {
  id: string; kind: UpdateKind; version: string; filename: string; size: number; sha256: string;
  bundleVersion?: string; bundleError?: string; uploadedAt?: string;
}
export interface UpdateDraft {
  origin: string; version: string; minClientVersion: string; description: string; changelog: string[];
  asar: string; installer: string; portable: string; config: string; asarFallbackUrl: string; configFallbackUrl: string;
}
export function packageUrl(origin: string, asset: UpdateAsset) {
  try {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return `${url.origin}/client-updates/packages/${asset.id}/${encodeURIComponent(asset.filename)}`;
  } catch { return ''; }
}
// Draft-only preview. The server validates and constructs the authoritative publication.
export function previewUpdate(draft: UpdateDraft, assets: UpdateAsset[], releaseDate: string) {
  const manifest: Record<string, any> = { version: draft.version, minClientVersion: draft.minClientVersion,
    releaseDate, description: draft.description.trim(), changelog: draft.changelog.map((line) => line.trim()).filter(Boolean) };
  for (const kind of UPDATE_KINDS) {
    const asset = assets.find((row) => row.id === draft[kind] && row.kind === kind);
    if (!asset) continue;
    const url = packageUrl(draft.origin, asset);
    if (kind === 'asar') {
      manifest.hotUpdate = { version: asset.version, asarUrl: url,
        fallbackUrl: draft.asarFallbackUrl, size: asset.size, sha256: asset.sha256 };
    } else if (kind === 'config') manifest.config = { version: asset.version, url, fallbackUrl: draft.configFallbackUrl };
    else manifest.fullUpdate = { ...manifest.fullUpdate, version: asset.version, [`${kind}Url`]: url };
  }
  return manifest;
}

export function downloadUpdateJson(manifest: Record<string, any>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'version.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
