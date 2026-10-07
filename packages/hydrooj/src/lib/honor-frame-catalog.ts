import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { PNG } from 'pngjs';
import { ValidationError } from '../error';
import { coll, framePath } from '../model/honor-frame';
import storage from '../model/storage';
import { MAX_FRAME_BYTES, normalizeHonorFrameImage } from './honor-frame-image';

export const frameNameKey = (name: string) => name.normalize('NFKC').trim().toLowerCase();

/** Compare decoded pixels, ignoring PNG metadata and invisible RGB values. */
export function frameArtworkHash(images: Buffer[]) {
    const hash = createHash('sha256').update('honor-frame-pair-v1');
    for (const input of images) {
        const image = PNG.sync.read(input);
        for (let i = 0; i < image.data.length; i += 4) {
            if (!image.data[i + 3]) image.data.fill(0, i, i + 3);
        }
        hash.update(`${image.width}x${image.height}:`).update(image.data);
    }
    return hash.digest('hex');
}

export async function readArtwork(path: string) {
    const stream = await storage.get(path);
    if (Buffer.isBuffer(stream)) return normalizeHonorFrameImage(stream);
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > MAX_FRAME_BYTES) throw new ValidationError('file');
        chunks.push(buffer);
    }
    return normalizeHonorFrameImage(Buffer.concat(chunks));
}

/** Add keys lazily without deleting or renaming existing duplicate awards. */
async function backfillKeys(withArtwork: boolean) {
    const pending = coll.find({ deleted: { $ne: true }, $or: [
        { nameKey: { $exists: false } },
        ...(withArtwork ? [{ artworkVersion: 2 as const, artworkHash: { $exists: false } }] : []),
    ] });
    for await (const doc of pending) {
        const values: { nameKey?: string, artworkHash?: string } = {};
        if (!doc.nameKey) values.nameKey = frameNameKey(doc.name);
        if (withArtwork && doc.artworkVersion === 2 && !doc.artworkHash) {
            const images = await Promise.all(['square', 'circle'].map((shape) => readArtwork(
                framePath(doc._id.toHexString(), shape, doc.artworkRevision),
            )));
            values.artworkHash = frameArtworkHash(images);
        }
        for (const [key, value] of Object.entries(values)) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await coll.updateOne({ _id: doc._id, deleted: { $ne: true }, [key]: { $exists: false } }, { $set: { [key]: value } });
            } catch (error) {
                // A legacy duplicate can remain keyless; one indexed copy is
                // sufficient to reject new copies. Do not remove owned awards.
                if (error?.code !== 11000) throw error;
            }
        }
    }
}

export async function assertUniqueFrame(name: string, artworkHash?: string, except?: ObjectId) {
    await backfillKeys(!!artworkHash);
    const exclude = except ? { _id: { $ne: except } } : {};
    const key = frameNameKey(name);
    if (await coll.findOne({ ...exclude, nameKey: key })) throw new ValidationError('name', null, 'An avatar frame with this name already exists.');
    // Existing duplicates may not carry the unique key. Renaming one of them
    // must still check the other originals.
    const legacy = await coll.find({ ...exclude, deleted: { $ne: true }, nameKey: { $exists: false } }).project({ name: 1 }).toArray();
    if (legacy.some((doc) => frameNameKey(doc.name) === key)) {
        throw new ValidationError('name', null, 'An avatar frame with this name already exists.');
    }
    if (artworkHash && await coll.findOne({ ...exclude, artworkHash })) {
        throw new ValidationError('file', null, 'These avatar frame images have already been uploaded.');
    }
}

export function frameDuplicateError(error: any) {
    if (error?.code !== 11000) return error;
    return error.keyPattern?.artworkHash
        ? new ValidationError('file', null, 'These avatar frame images have already been uploaded.')
        : new ValidationError('name', null, 'An avatar frame with this name already exists.');
}
