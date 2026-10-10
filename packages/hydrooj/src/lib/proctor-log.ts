import { constants, createDecipheriv, createHash, privateDecrypt } from 'crypto';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { Writable } from 'stream';
import { pipeline } from 'stream/promises';

export async function hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
}

function bytes(value: unknown, length: number): Buffer {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encrypted log header');
    const result = Buffer.from(value, 'base64url');
    if (result.length !== length || result.toString('base64url') !== value) throw new Error('Invalid encrypted log header');
    return result;
}

// Verify ciphertext integrity without retaining, indexing or interpreting log content.
export async function validateEncryptedLog(path: string, loadKey: (id: string) => Promise<{ encryptionPrivateKey: string }>) {
    const file = await open(path, 'r');
    const prefix = Buffer.alloc(8192);
    let count: number;
    try {
        count = (await file.read(prefix, 0, prefix.length, 0)).bytesRead;
    } finally {
        await file.close();
    }
    const first = prefix.indexOf('\n');
    const second = prefix.indexOf('\n', first + 1);
    if (first < 0 || second < 0 || second >= count || prefix.subarray(0, first).toString() !== 'HYDRO-PROCTOR-LOG/1') {
        throw new Error('Invalid encrypted log header');
    }
    const header = JSON.parse(prefix.subarray(first + 1, second).toString('utf8'));
    if (!/^[a-f0-9]{32}$/.test(header.keyId || '')) throw new Error('Invalid encrypted log key');
    const keys = await loadKey(header.keyId);
    const key = privateDecrypt({ key: keys.encryptionPrivateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        bytes(header.wrappedKey, 384));
    if (key.length !== 32) throw new Error('Invalid encrypted log key');
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, bytes(header.iv, 12));
        decipher.setAAD(Buffer.from(`HYDRO-PROCTOR-LOG/1:${header.keyId}`));
        decipher.setAuthTag(bytes(header.tag, 16));
        await pipeline(createReadStream(path, { start: second + 1 }), decipher,
            new Writable({ write(chunk, encoding, callback) { callback(); } }));
    } finally {
        key.fill(0);
    }
}
