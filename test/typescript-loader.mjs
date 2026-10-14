import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

// Unit suites use ESM (including import.meta), while repository sources also
// use extensionless TypeScript imports and legacy decorators.
export async function resolve(specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        if (!['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error.code)) throw error;
        if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
            const url = new URL(specifier, context.parentURL);
            for (const suffix of ['.ts', '.tsx', '/index.ts']) {
                const candidate = new URL(url.href + suffix);
                if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
            }
        } else if (context.parentURL) {
            try {
                const filename = createRequire(context.parentURL).resolve(`${specifier}.ts`);
                return { url: pathToFileURL(filename).href, shortCircuit: true };
            } catch { /* Preserve the original resolution error. */ }
        }
        throw error;
    }
}

export async function load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !/\.(ts|tsx)$/.test(url)) return nextLoad(url, context);
    const filename = fileURLToPath(url);
    const { code } = transformSync(readFileSync(filename, 'utf8'), {
        loader: url.endsWith('.tsx') ? 'tsx' : 'ts',
        format: 'esm', target: 'node22', sourcefile: filename, sourcemap: 'inline',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    });
    return { format: 'module', source: code, shortCircuit: true };
}
