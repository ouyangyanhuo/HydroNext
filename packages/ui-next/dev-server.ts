import http from 'http';
import { createServer, type InlineConfig } from 'vite';

/** Hold the HMR socket before starting Vite, so parallel dev instances cannot race for a fixed port. */
export async function createDevelopmentServer(options: InlineConfig, host = '127.0.0.1', port = 0) {
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid HYDRO_UI_NEXT_HMR_PORT.');
    const socket = http.createServer((_request, response) => {
        response.writeHead(426);
        response.end('WebSocket upgrade required');
    });
    await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.listen(port, host, () => {
            socket.off('error', reject);
            resolve();
        });
    });
    const closeSocket = () => new Promise<void>((resolve, reject) => {
        if (!socket.listening) {
            resolve();
            return;
        }
        socket.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
    try {
        const address = socket.address();
        if (!address || typeof address === 'string') throw new Error('Cannot resolve the development HMR port.');
        const vite = await createServer({ ...options,
            server: { ...options.server, ws: { server: socket, port: address.port, clientPort: address.port } } });
        return { vite, async close() {
            try {
                await vite.close();
            } finally {
                await closeSocket();
            }
        } };
    } catch (error) {
        await closeSocket();
        throw error;
    }
}
