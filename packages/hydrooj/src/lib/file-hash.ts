import { createHash } from 'crypto';
import { createReadStream } from 'fs';

/** Stream files so hashing uploads never requires retaining the whole file. */
export async function hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
}
