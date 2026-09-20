import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    root: __dirname,
    base: '/',
    // Keep dev-time dependency optimization out of node_modules, which can be
    // owned by a different user after a Docker build.
    cacheDir: path.join(os.tmpdir(), 'hydro-ui-next-vite', createHash('sha1').update(__dirname).digest('hex').slice(0, 12)),
    plugins: [tailwindcss(), react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    publicDir: 'pub',
    build: {
        outDir: 'public',
        emptyOutDir: true,
        chunkSizeWarningLimit: 600,
        rolldownOptions: {
            output: {
                codeSplitting: true,
                manualChunks(id: string) {
                    if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
                        return 'react-vendor';
                    }
                    if (id.includes('node_modules/@mantine')) {
                        return 'mantine-vendor';
                    }
                    return undefined;
                },
            },
        },
    },
    worker: { format: 'es' },
});
