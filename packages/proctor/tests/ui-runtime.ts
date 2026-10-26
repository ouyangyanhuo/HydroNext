import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as registry from '../../ui-next/src/registry/request-security.ts';
import * as requests from '../../ui-next/src/utils/request.ts';

const module = { exports: {} as any };
const code = transformSync(readFileSync(new URL('../ui/utils/proctor.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const run = runInThisContext(`(function(module, exports, require) {${code}\n})`);
run(module, module.exports, (name: string) => {
    if (name !== '@hydrooj/ui-next') throw new Error(`Unexpected UI runtime import: ${name}`);
    return { ...requests, ...registry };
});
export const proctor = module.exports;
