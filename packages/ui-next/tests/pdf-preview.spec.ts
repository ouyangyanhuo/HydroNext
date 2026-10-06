import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPdfDocument } from '../src/utils/pdf-preview.ts';

test('closing during the PDF library import never starts a download', async () => {
    let imported!: (library: any) => void;
    let downloads = 0;
    const controller = new AbortController();
    const result = loadPdfDocument('/large.pdf', controller.signal, () => new Promise((resolve) => { imported = resolve; }));
    controller.abort();
    imported({ getDocument: () => { downloads++; } });
    await assert.rejects(result, { name: 'AbortError' });
    assert.equal(downloads, 0);
});

test('closing while downloading destroys the PDF loading task exactly once', async () => {
    let destroyed = 0;
    let reject!: (error: Error) => void;
    const controller = new AbortController();
    const result = loadPdfDocument('/large.pdf', controller.signal, async () => ({
        getDocument: () => ({
            promise: new Promise((_, fail) => { reject = fail; }),
            destroy: async () => { destroyed++; reject(new Error('cancelled')); },
        }),
    } as any));
    await Promise.resolve();
    controller.abort();
    await assert.rejects(result, /cancelled/);
    controller.abort();
    assert.equal(destroyed, 1);
});

test('loaded PDF documents remain owned by the signal until the preview closes', async () => {
    let destroyed = 0;
    const controller = new AbortController();
    const document = { numPages: 100 };
    const loaded = await loadPdfDocument('/large.pdf', controller.signal, async () => ({
        getDocument: () => ({ promise: Promise.resolve(document), destroy: async () => { destroyed++; } }),
    } as any));
    assert.equal(loaded, document);
    assert.equal(destroyed, 0);
    controller.abort();
    assert.equal(destroyed, 1);
});

test('load failures dispose of workers and remove the abort listener', async () => {
    let destroyed = 0;
    const controller = new AbortController();
    await assert.rejects(loadPdfDocument('/broken.pdf', controller.signal, async () => ({
        getDocument: () => ({
            promise: Promise.reject(new Error('Invalid PDF')),
            destroy: async () => { destroyed++; throw new Error('Worker already gone'); },
        }),
    } as any)), /Invalid PDF/);
    controller.abort();
    assert.equal(destroyed, 1);
});
