import { Button, Group, Image, LoadingOverlay, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { CodeEditor } from '@/components/editor/code-editor';
import { useI18n } from '@/hooks/use-i18n';

function formatFileSize(size?: number) {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function getFileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function isImage(ext: string) {
  return ['png', 'jpeg', 'jpg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
}

function isVideo(ext: string) {
  return ['mp4', 'webm', 'ogg'].includes(ext);
}

function isPreviewableText(ext: string) {
  return ['txt', 'in', 'out', 'ans', 'md', 'yaml', 'yml', 'json', 'xml', 'csv',
    'cpp', 'c', 'cc', 'h', 'hpp', 'py', 'java', 'js', 'ts', 'go', 'rs', 'pas',
    'rb', 'php', 'sh', 'bat', 'sql', 'css', 'html', 'htm'].includes(ext);
}

function resolveEditorLang(ext: string): string {
  const map: Record<string, string> = {
    yaml: 'yaml', yml: 'yaml', json: 'json', xml: 'xml',
    cpp: 'cpp', cc: 'cpp', c: 'c', h: 'cpp', hpp: 'cpp',
    py: 'python', java: 'java', js: 'javascript', ts: 'typescript',
    go: 'go', rs: 'rust', pas: 'pascal', rb: 'ruby', php: 'php',
    sh: 'shell', bat: 'shell', sql: 'sql', css: 'css', html: 'html', htm: 'html',
    in: 'plaintext', out: 'plaintext', ans: 'plaintext', txt: 'plaintext', md: 'markdown',
  };
  return map[ext] || 'plaintext';
}

function isDocx(ext: string) {
  return ext === 'docx';
}

function isOldOffice(ext: string) {
  return ['doc', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext);
}

function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const loadingTask = pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) break;
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.style.display = 'block';
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.marginBottom = '4px';
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          if (!cancelled) container.appendChild(canvas);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  return (
    <div style={{ position: 'relative', minHeight: 200 }}>
      <LoadingOverlay visible={loading} />
      {pageCount > 0 && (
        <Text size="xs" c="dimmed" mb="xs">{pageCount} {pageCount === 1 ? 'page' : 'pages'}</Text>
      )}
      {error && <Text size="sm" c="red">{error}</Text>}
      <div ref={containerRef} className="overflow-auto rounded-md border border-[var(--hydro-border)]" style={{ maxHeight: '70vh' }} />
    </div>
  );
}

function DocxViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        const resp = await fetch(url);
        const buffer = await resp.arrayBuffer();
        if (cancelled) return;
        await renderAsync(buffer, container, undefined, { className: 'docx-preview' });
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load document');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  return (
    <div style={{ position: 'relative', minHeight: 200 }}>
      <LoadingOverlay visible={loading} />
      {error && <Text size="sm" c="red">{error}</Text>}
      <div ref={containerRef} className="overflow-auto rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] p-4" style={{ maxHeight: '70vh' }} />
    </div>
  );
}

export interface FilePreviewModalProps {
  opened: boolean;
  onClose: () => void;
  file: { name: string; size: number } | null;
  fileUrl: string;
  canEdit?: boolean;
  onSave?: (filename: string, content: string) => Promise<void>;
}

export function FilePreviewModal({ opened, onClose, file, fileUrl, canEdit = false, onSave }: FilePreviewModalProps) {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const ext = file ? getFileExt(file.name) : '';

  useEffect(() => {
    if (!opened || !file) return;
    setContent('');
    setEditing(false);
    if (file.size === 0) {
      setEditing(true);
      return;
    }
    if (isPreviewableText(ext) && file.size <= 8 * 1024 * 1024) {
      setLoading(true);
      fetch(fileUrl)
        .then((r) => r.text())
        .then((text) => { setContent(text); setEditing(true); })
        .catch(() => setContent(''))
        .finally(() => setLoading(false));
    }
  }, [opened, file, fileUrl, ext]);

  const handleSave = async () => {
    if (!file || !onSave) return;
    setSaving(true);
    try {
      await onSave(file.name, content);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!file) return null;

  const isDoc = ext === 'pdf' || isDocx(ext) || isOldOffice(ext);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={(
        <Group gap="sm">
          <Text fw={700}>{file.name}</Text>
          <Text size="xs" c="dimmed">{formatFileSize(file.size)}</Text>
        </Group>
      )}
      size={isDoc ? 'calc(100vw - 120px)' : 'xl'}
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        {isImage(ext) && (
          <Image src={fileUrl} alt={file.name} maw="100%" fit="contain" />
        )}
        {isVideo(ext) && (
          <video controls style={{ width: '100%' }}>
            <source src={fileUrl} />
          </video>
        )}
        {ext === 'pdf' && <PdfViewer url={fileUrl} />}
        {isDocx(ext) && <DocxViewer url={fileUrl} />}
        {loading && <Text size="sm" c="dimmed">{t('Loading...')}</Text>}
        {editing && (
          <CodeEditor
            value={content}
            onChange={setContent}
            language={resolveEditorLang(ext)}
            height={500}
          />
        )}
        {isOldOffice(ext) && (
          <Stack gap="sm" align="center" py="xl">
            <Text size="sm" c="dimmed">{t('This file type cannot be previewed directly in the browser.')}</Text>
            <Text size="xs" c="dimmed">{t('Please download and open with a compatible application.')}</Text>
          </Stack>
        )}
        {!isImage(ext) && !isVideo(ext) && ext !== 'pdf' && !isDocx(ext) && !isOldOffice(ext) && !loading && !editing && (
          <Text size="sm" c="dimmed">{t('Cannot preview this file type.')}</Text>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="xs" onClick={() => window.open(fileUrl)}>
            {t('Download')}
          </Button>
          {canEdit && editing && onSave && (
            <Button size="xs" onClick={handleSave} loading={saving}>
              {t('Save')}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
