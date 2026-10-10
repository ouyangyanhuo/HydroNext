import {
    createHash, createPublicKey, randomBytes, sign, verify,
} from 'crypto';

export const PROCTOR_PROTOCOL = 'hydro-proctor/1';

export function canonical(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function digest(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

export const secret = () => randomBytes(32).toString('base64url');

export function proctorOrigin(observed: string, host: string, configured = ''): string {
    let origin = new URL(observed);
    try {
        const publicUrl = new URL(configured);
        if (publicUrl.host === host) origin = publicUrl;
    } catch { /* Relative/default server URLs use the trusted proxy configuration. */ }
    if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
        throw new Error('Proctor requires HTTPS. Configure the public server URL and trusted proxy.');
    }
    return origin.origin;
}

export function normalizeClientKey(pem: string): string {
    if (typeof pem !== 'string' || pem.length > 2000) throw new Error('Invalid client key');
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Client key must be Ed25519');
    return key.export({ type: 'spki', format: 'pem' }).toString();
}

export function signedPayload(payload: unknown, privateKey: string): string {
    return sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64url');
}

export function verifyPayload(payload: unknown, signature: unknown, publicKey: string): boolean {
    if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
    try {
        return verify(null, Buffer.from(canonical(payload)), publicKey, Buffer.from(signature, 'base64url'));
    } catch {
        return false;
    }
}

export interface ProctorProof {
    protocol: string;
    action: string;
    method: string;
    path: string;
    tokenHash: string;
    fingerprint: string;
    version: string;
    payloadHash: string;
    timestamp: number;
    nonce: string;
}

export function decodeProof(encoded: string): { payload: ProctorProof, signature: string } {
    if (typeof encoded !== 'string' || encoded.length > 8000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid proof');
    const result = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!result?.payload || typeof result.signature !== 'string') throw new Error('Invalid proof');
    return result;
}

export function validProof(payload: ProctorProof, expected: Omit<ProctorProof, 'protocol' | 'timestamp' | 'nonce'>, now = Date.now()): boolean {
    return payload.protocol === PROCTOR_PROTOCOL
        && Object.entries(expected).every(([key, value]) => payload[key] === value)
        && Number.isSafeInteger(payload.timestamp) && Math.abs(now - payload.timestamp) <= 60000
        && typeof payload.nonce === 'string' && /^[A-Za-z0-9_-]{32,100}$/.test(payload.nonce);
}

export function submissionPayload(pid: number, lang: string, code = '', pretest = false, input: string[] = [], fileHash = '') {
    return { pid, lang, code, pretest, input, fileHash };
}

export function proctorRankingFilter(enabled: boolean, ended: boolean, durationHours = 0, now = Date.now()) {
    if (!enabled) return {};
    // Provisional scores may be shown while competing. Closing or ended attempts
    // require a successfully stored final log before becoming ranked results.
    return ended ? { proctorLogUploaded: true }
        : { $or: [{ proctorLogUploaded: true }, { proctorEnded: { $ne: true }, $and: [
            { $or: [{ endAt: null }, { endAt: { $gt: new Date(now) } }] },
            ...(durationHours > 0 ? [{ $or: [{ startAt: null }, { startAt: { $gt: new Date(now - durationHours * 3600000) } }] }] : []),
        ] }] };
}
