import fs from 'fs';
import path from 'path';

function normalizeIdentifier(value?: string) {
    return String(value || '').trim().replace(/\s+/g, '-').slice(0, 128);
}

function normalizeBuildTime(value?: string) {
    const date = new Date(String(value || '').trim());
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function resolveBuildIdentifier(
    fallback = '',
    env: NodeJS.ProcessEnv = process.env,
    cwd = process.cwd(),
) {
    const injected = normalizeIdentifier(env.HYDRO_BUILD_ID);
    if (injected) return injected;

    const candidates = [
        env.HYDRO_BUILD_ID_FILE,
        path.join(cwd, '.build-id'),
    ].filter(Boolean) as string[];
    for (const filename of new Set(candidates)) {
        try {
            const value = normalizeIdentifier(fs.readFileSync(filename, 'utf8'));
            if (value) return value;
        } catch {
            // The build identifier file is optional outside Docker.
        }
    }
    return normalizeIdentifier(fallback);
}

export function resolveBuildTime(
    env: NodeJS.ProcessEnv = process.env,
    cwd = process.cwd(),
    fallback = '',
) {
    const injected = normalizeBuildTime(env.HYDRO_BUILD_TIME);
    if (injected) return injected;

    const candidates = [
        env.HYDRO_BUILD_TIME_FILE,
        path.join(cwd, '.build-time'),
    ].filter(Boolean) as string[];
    for (const filename of new Set(candidates)) {
        try {
            const value = normalizeBuildTime(fs.readFileSync(filename, 'utf8'));
            if (value) return value;
        } catch {
            // The build time file is optional outside Docker.
        }
    }
    return normalizeBuildTime(fallback);
}
