import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfLibrary = Pick<typeof import('pdfjs-dist'), 'getDocument'>;

async function loadLibrary(): Promise<PdfLibrary> {
  const library = await import('pdfjs-dist');
  library.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return library;
}

/** The signal owns the whole document lifetime, not just the initial download. */
export async function loadPdfDocument(
  url: string,
  signal: AbortSignal,
  load: () => Promise<PdfLibrary> = loadLibrary,
): Promise<PDFDocumentProxy> {
  const library = await load();
  // Importing is not abortable. Do not start a worker/download after closing.
  signal.throwIfAborted();
  const task = library.getDocument({ url });
  const destroy = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', destroy, { once: true });
  try {
    const document = await task.promise;
    signal.throwIfAborted();
    return document;
  } catch (error) {
    signal.removeEventListener('abort', destroy);
    if (!signal.aborted) destroy();
    throw error;
  }
}
