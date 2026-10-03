import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

class FakeXHR {
    static latest: FakeXHR;
    status = 200;
    responseText = '';
    upload: any = {};
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    aborted = false;
    headers: Record<string, string> = {};
    constructor() { FakeXHR.latest = this; }
    open() {}
    send() {}
    setRequestHeader(key: string, value: string) { this.headers[key] = value; }
    abort() { this.aborted = true; this.onabort?.(); }
}
const output = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/utils/file-upload.ts', import.meta.url))],
    bundle: true, format: 'cjs', platform: 'node', write: false,
});
const module = { exports: {} as any };
runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, XMLHttpRequest: FakeXHR, DOMException });
const { uploadForm, validateUploadFiles } = module.exports;

test('upload validation handles extensions, MIME types, size and single-selection consistently', () => {
    const options = { multiple: false, maxSize: 10, accept: ['.zip', 'image/*'] };
    const file = { name: 'DATA.ZIP', size: 10, type: '' };
    assert.equal(validateUploadFiles([file], options), undefined);
    assert.equal(validateUploadFiles([{ ...file, name: 'picture', type: 'image/png' }], options), undefined);
    assert.equal(validateUploadFiles([{ ...file, name: 'script.exe' }], options).key, 'Unsupported file type: {name}');
    assert.equal(validateUploadFiles([{ ...file, size: 11 }], options).key, 'File too large: {name}');
    assert.equal(validateUploadFiles([file, file], options).key, 'Please select only one file.');
});

test('HTTP errors, application errors, HTML and malformed JSON cannot become successful uploads', async () => {
    const responses = [
        [500, '<html>Error</html>'], [403, '{}'], [200, '{bad'],
        [200, '<html>Login</html>'], [200, '{"error":{"message":"Denied"}}'],
    ];
    for (const [status, text] of responses) {
        const promise = uploadForm('/d/team/upload', new FormData(), new AbortController().signal, () => {}, 'Upload failed');
        FakeXHR.latest.status = status as number;
        FakeXHR.latest.responseText = text as string;
        FakeXHR.latest.onload!();
        // Each request is isolated so a previous rejection cannot leak into the next case.
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(promise, /Upload failed|Denied/);
    }
});

test('valid JSON and empty successful responses retain their result contract', async () => {
    const promise = uploadForm('/upload', new FormData(), new AbortController().signal, () => {}, 'Upload failed');
    FakeXHR.latest.responseText = '{"id":42}';
    assert.equal(FakeXHR.latest.headers.Accept, 'application/json');
    FakeXHR.latest.onload!();
    assert.equal((await promise).id, 42);
    const empty = uploadForm('/upload', new FormData(), new AbortController().signal, () => {}, 'Upload failed');
    FakeXHR.latest.status = 204;
    FakeXHR.latest.onload!();
    assert.equal((await empty).ok, true);
});

test('cancellation aborts the active XHR and does not deliver later progress', async () => {
    const controller = new AbortController();
    let progress = 0;
    const promise = uploadForm('/upload', new FormData(), controller.signal, (value: number) => { progress = value; }, 'Upload failed');
    FakeXHR.latest.upload.onprogress({ lengthComputable: true, total: 10, loaded: 5 });
    assert.equal(progress, 0.5);
    controller.abort();
    assert.equal(FakeXHR.latest.aborted, true);
    FakeXHR.latest.upload.onprogress({ lengthComputable: true, total: 10, loaded: 9 });
    assert.equal(progress, 0.5);
    await assert.rejects(promise, { name: 'AbortError' });
});
