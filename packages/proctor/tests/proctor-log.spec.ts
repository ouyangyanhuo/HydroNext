import assert from 'node:assert/strict';
import { constants, createCipheriv, generateKeyPairSync, publicEncrypt, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hashFile } from '../../hydrooj/src/lib/file-hash.ts';
import { digest } from '../lib/proctor.ts';
import { validateEncryptedLog } from '../lib/proctor-log.ts';

const keys = generateKeyPairSync('rsa', { modulusLength: 3072 });
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const keyId = 'a'.repeat(32);
const device = generateKeyPairSync('ed25519');
const binding = { uid: 7, domainId: 'exam', tid: 'b'.repeat(24), attemptId: 'c'.repeat(24),
    publicKey: device.publicKey.export({ type: 'spki', format: 'pem' }).toString(), fingerprint: 'd'.repeat(64) };
function encryptedFile(text: string) {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`HYDRO-PROCTOR-LOG/1:${keyId}`));
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const header = { keyId, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'),
        wrappedKey: publicEncrypt({ key: keys.publicKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256' },
        key).toString('base64url') };
    return Buffer.concat([Buffer.from(`HYDRO-PROCTOR-LOG/1\n${JSON.stringify(header)}\n`), ciphertext]);
}

test('encrypted log authentication is streamed and the persisted file remains ciphertext', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hydro-proctor-log-'));
    try {
        const path = join(directory, 'final.hplog');
        const file = encryptedFile('CLIENT_START\nABNORMAL_EXIT_DETECTED\nCLIENT_RESTART\nFINISH\n'.repeat(10000));
        await writeFile(path, file);
        const seen: string[] = [];
        await validateEncryptedLog(path, async (id) => {
            seen.push(id);
            return { encryptionPrivateKey: privateKey };
        });
        assert.deepEqual(seen, [keyId]);
        assert.equal(await hashFile(path), digest(file));
        assert.equal(file.includes(Buffer.from('ABNORMAL_EXIT_DETECTED')), false);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('plaintext, corrupted ciphertext, truncated files and malicious/oversized headers are rejected', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hydro-proctor-log-'));
    try {
        const path = join(directory, 'bad.hplog');
        const valid = encryptedFile('event');
        const corrupt = Buffer.from(valid);
        corrupt[corrupt.length - 1] ^= 1;
        const examples = [Buffer.from('old plaintext logger contents'), corrupt, valid.subarray(0, valid.length - 1),
            Buffer.from('HYDRO-PROCTOR-LOG/1\n{"keyId":"../../secret"}\nbody'),
            Buffer.from(`HYDRO-PROCTOR-LOG/1\n${' '.repeat(8192)}\n`),
            Buffer.from('HYDRO-PROCTOR-LOG/1\r\n{}\r\nbody')];
        for (const file of examples) {
            // eslint-disable-next-line no-await-in-loop
            await writeFile(path, file);
            // eslint-disable-next-line no-await-in-loop
            await assert.rejects(validateEncryptedLog(path, async () => ({ encryptionPrivateKey: privateKey })));
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('upload identity must match the user, domain, contest, attempt and device inside the encrypted journal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hydro-proctor-binding-'));
    try {
        const path = join(directory, 'final.hplog');
        const loadKey = async () => ({ encryptionPrivateKey: privateKey });
        const journal = (value: unknown) => encryptedFile(`${JSON.stringify({ protocol: 'hydro-journal/1', binding: value })}\nEVENT\n`);
        const valid = journal(binding);
        await writeFile(path, valid);
        await validateEncryptedLog(path, loadKey, binding);
        assert.equal(await hashFile(path), digest(valid));
        for (const key of ['uid', 'domainId', 'tid', 'attemptId', 'publicKey', 'fingerprint']) {
            // eslint-disable-next-line no-await-in-loop
            await writeFile(path, journal({ ...binding, [key]: key === 'uid' ? 8 : 'another' }));
            // eslint-disable-next-line no-await-in-loop
            await assert.rejects(validateEncryptedLog(path, loadKey, binding));
        }
        for (const text of ['EVENT\n', '', JSON.stringify({ binding }), `${' '.repeat(16385)}\n`,
            `${JSON.stringify({ protocol: 'hydro-journal/2', binding })}\n`]) {
            // eslint-disable-next-line no-await-in-loop
            await writeFile(path, encryptedFile(text));
            // eslint-disable-next-line no-await-in-loop
            await assert.rejects(validateEncryptedLog(path, loadKey, binding));
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
