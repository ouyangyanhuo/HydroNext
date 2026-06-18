import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    root: __dirname,
    base: '/',
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
                },
            },
        },
    },
    worker: { format: 'es' },
});
