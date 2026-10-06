import { PNG } from 'pngjs';

export const MAX_FRAME_BYTES = 2 * 1024 * 1024;

/** Decode and re-encode, discarding all ancillary metadata and animation. */
export function normalizeHonorFrameImage(input: Buffer): Buffer {
    if (!input.length || input.length > MAX_FRAME_BYTES
        || input.length < 33 || !input.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        || input.readUInt32BE(8) !== 13 || input.toString('ascii', 12, 16) !== 'IHDR') {
        throw new Error('Invalid PNG');
    }
    // Reject decompression bombs before the decoder allocates the pixel buffer.
    const width = input.readUInt32BE(16);
    const height = input.readUInt32BE(20);
    if (width !== height || width < 64 || width > 1024) throw new Error('Invalid dimensions');
    // Browser canvas output is non-interlaced. pngjs' interlaced decoder uses
    // unbounded inflate, so do not accept that path for uploaded documents.
    if (input[28] !== 0) throw new Error('Interlaced PNG is not supported');
    let headers = 0;
    let ended = false;
    for (let offset = 8; offset < input.length;) {
        if (offset + 12 > input.length) throw new Error('Truncated PNG chunk');
        const length = input.readUInt32BE(offset);
        if (length > input.length - offset - 12) throw new Error('Invalid PNG chunk length');
        const type = input.toString('ascii', offset + 4, offset + 8);
        if (type === 'IHDR' && ++headers !== 1) throw new Error('Duplicate PNG header');
        offset += length + 12;
        if (type === 'IEND') {
            if (length || offset !== input.length) throw new Error('Invalid PNG ending');
            ended = true;
        }
    }
    if (!ended) throw new Error('Missing PNG ending');
    const decoded = PNG.sync.read(input, { checkCRC: true });
    let transparent = false;
    let visible = false;
    for (let i = 3; i < decoded.data.length; i += 4) {
        transparent ||= decoded.data[i] < 255;
        visible ||= decoded.data[i] > 0;
    }
    if (!transparent || !visible) throw new Error('Frame must contain transparent and visible pixels');
    const result = PNG.sync.write(decoded, { colorType: 6 });
    if (result.length > MAX_FRAME_BYTES) throw new Error('Image too large');
    return result;
}
