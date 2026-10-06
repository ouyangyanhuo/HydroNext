import { LoadingOverlay, Pagination, Stack, Text } from '@mantine/core';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';
import { loadPdfDocument } from '@/utils/pdf-preview';

function PdfPage({ document, pageNumber }: { document: PDFDocumentProxy, pageNumber: number }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let rendering = false;
    const canvas = canvasRef.current!;
    void (async () => {
      let page: PDFPageProxy | undefined;
      try {
        page = await document.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        // Bound the canvas allocation even for unusually large document pages.
        const scale = Math.min(1.5, Math.sqrt(4_000_000 / (base.width * base.height)));
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvas, viewport });
        rendering = true;
        await renderTask.promise;
      } catch (err: any) {
        if (!cancelled) setError(formatErrorMessage(err, t('Failed to load PDF')));
      } finally {
        rendering = false;
        // Wait until cancellation/rendering settles before releasing resources.
        page?.cleanup();
        if (cancelled) {
          canvas.width = 0;
          canvas.height = 0;
        } else setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      if (!rendering) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [document, pageNumber, t]);

  return (
    <div className="relative min-h-[200px] overflow-auto rounded-md border border-[var(--hydro-border)]" style={{ maxHeight: '65vh' }}>
      <LoadingOverlay visible={loading} />
      {error && <Text size="sm" c="red" role="alert" p="sm">{error}</Text>}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
    </div>
  );
}

function PdfDocumentViewer({ url }: { url: string }) {
  const { t } = useI18n();
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void loadPdfDocument(url, controller.signal).then((pdf) => {
      if (!controller.signal.aborted) setDocument(pdf);
    }).catch((err) => {
      if (!controller.signal.aborted) setError(formatErrorMessage(err, t('Failed to load PDF')));
    });
    return () => controller.abort();
  }, [url, t]);

  return (
    <Stack gap="sm" className="relative min-h-[200px]">
      <LoadingOverlay visible={!document && !error} />
      {error && <Text size="sm" c="red" role="alert">{error}</Text>}
      {document && (
        <>
          <PdfPage key={page} document={document} pageNumber={page} />
          <Text size="xs" c="dimmed" ta="center" aria-live="polite">{page} / {document.numPages}</Text>
          {document.numPages > 1 && <Pagination size="xs" total={document.numPages} value={page} onChange={setPage} siblings={1} mx="auto" />}
        </>
      )}
    </Stack>
  );
}

export function PdfViewer({ url }: { url: string }) {
  return <PdfDocumentViewer key={url} url={url} />;
}
