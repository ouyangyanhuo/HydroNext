import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { createDevelopmentServer } from '../dev-server.ts';

const require = createRequire(import.meta.url);
const options = { configFile: false as const, root: tmpdir(), publicDir: false as const, logLevel: 'silent' as const,
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null } };
function bind(port: number) {
    const server = http.createServer();
    return new Promise<http.Server>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
            server.off('error', reject);
            resolve(server);
        });
    });
}
const close = (server: http.Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test('parallel dev instances have working HMR on separate owned sockets and release them on close', async () => {
    const a = await createDevelopmentServer(options);
    const b = await createDevelopmentServer(options);
    const portA = (a.vite.config.server.ws as { port: number }).port;
    const portB = (b.vite.config.server.ws as { port: number }).port;
    try {
        assert.ok(portA > 0 && portB > 0);
        assert.notEqual(portA, portB);
        assert.equal((a.vite.config.server.ws as { clientPort: number }).clientPort, portA);
        const WebSocket = require('ws');
        const socket = new WebSocket(`ws://127.0.0.1:${portA}/`, 'vite-hmr');
        try {
            const connected = await new Promise<any>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('HMR did not connect')), 3000);
                socket.once('error', (error: Error) => {
                    clearTimeout(timer);
                    reject(error);
                });
                socket.once('message', (data: Buffer) => {
                    clearTimeout(timer);
                    resolve(JSON.parse(data.toString()));
                });
            });
            assert.equal(connected.type, 'connected');
        } finally { socket.terminate(); }
        await assert.rejects(createDevelopmentServer(options, '127.0.0.1', portA), { code: 'EADDRINUSE' });
    } finally {
        await Promise.all([a.close(), b.close()]);
    }
    const rebound = await bind(portA);
    await close(rebound);
});

test('failed Vite initialization releases HMR, and invalid explicit ports fail before binding', async () => {
    const probe = await bind(0);
    const port = (probe.address() as { port: number }).port;
    await close(probe);
    await assert.rejects(createDevelopmentServer({ ...options,
        plugins: [{ name: 'startup-failure', config() { throw new Error('startup failure'); } }] }, '127.0.0.1', port), /startup failure/);
    const rebound = await bind(port);
    await close(rebound);
    await assert.rejects(createDevelopmentServer(options, '127.0.0.1', -1), /Invalid HYDRO_UI_NEXT_HMR_PORT/);
});
