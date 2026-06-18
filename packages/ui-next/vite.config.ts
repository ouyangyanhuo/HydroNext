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
        rolldownOptions: {
            output: {
                codeSplitting: true,
            },
        },
    },
    worker: { format: 'es' },
});
