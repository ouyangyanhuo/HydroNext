import fs from 'fs';
import path from 'path';

function normalizeIdentifier(value?: string) {
    return String(value || '').trim().replace(/\s+/g, '-').slice(0, 128);
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
