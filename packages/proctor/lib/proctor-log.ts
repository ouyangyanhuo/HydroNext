import { constants, createDecipheriv, privateDecrypt } from 'crypto';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { normalizeClientKey } from './proctor';

export interface ProctorLogBinding {
    uid: number;
    domainId: string;
    tid: string;
    attemptId: string;
    publicKey: string;
    fingerprint: string;
}

function verifyBinding(line: Buffer, expected: ProctorLogBinding) {
    const header = JSON.parse(line.toString('utf8'));
    const binding = header?.binding;
    if (header?.protocol !== 'hydro-journal/1' || !binding || typeof binding !== 'object'
        || ['uid', 'domainId', 'tid', 'attemptId', 'fingerprint'].some((key) => binding[key] !== expected[key])
        || normalizeClientKey(binding.publicKey) !== normalizeClientKey(expected.publicKey)) {
        throw new Error('Encrypted proctor log belongs to a different attempt.');
    }
}

function bytes(value: unknown, length: number): Buffer {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encrypted log header');
    const result = Buffer.from(value, 'base64url');
    if (result.length !== length || result.toString('base64url') !== value) throw new Error('Invalid encrypted log header');
    return result;
}

// Inspect only the bounded identity header; event contents are discarded, never persisted as plaintext.
export async function validateEncryptedLog(path: string, loadKey: (id: string) => Promise<{ encryptionPrivateKey: string }>,
    expected?: ProctorLogBinding) {
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
        let identity = Buffer.alloc(0);
        let checked = !expected;
        await pipeline(createReadStream(path, { start: second + 1 }), decipher,
            new Writable({ write(chunk: Buffer, encoding, callback) {
                try {
                    if (!checked) {
                        const end = chunk.indexOf('\n');
                        const part = end < 0 ? chunk : chunk.subarray(0, end);
                        if (identity.length + part.length > 16384) throw new Error('Oversized proctor log identity.');
                        identity = Buffer.concat([identity, part]);
                        if (end >= 0) {
                            verifyBinding(identity, expected);
                            identity = Buffer.alloc(0);
                            checked = true;
                        }
                    }
                    callback();
                } catch (error) {
                    callback(error);
                }
            } }));
        if (!checked) throw new Error('Missing proctor log identity.');
    } finally {
        key.fill(0);
    }
}
