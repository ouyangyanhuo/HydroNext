import { useEffect, useRef } from 'react';
import { Paper } from '@mantine/core';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

interface MarkdownRendererProps {
  content: any;
  className?: string;
}

/**
 * Renders Markdown/HTML content from the backend.
 * Handles multilingual content objects.
 * Applies KaTeX rendering for math formulas and syntax highlighting for code blocks.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const language = useSessionStore((s) => s.language);
  const text = extractLocalizedContent(content, language);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Apply KaTeX rendering for math formulas
    const katex = (window as any).katex;
    if (katex) {
      ref.current.querySelectorAll('.katex-inline, [data-math-inline]').forEach((el: Element) => {
        const tex = el.getAttribute('data-math') || el.textContent || '';
        try { katex.render(tex, el as HTMLElement, { throwOnError: false }); } catch { /* ignore */ }
      });
      ref.current.querySelectorAll('.katex-display, [data-math-display]').forEach((el: Element) => {
        const tex = el.getAttribute('data-math') || el.textContent || '';
        try { katex.render(tex, el as HTMLElement, { displayMode: true, throwOnError: false }); } catch { /* ignore */ }
      });
    }
    // Apply syntax highlighting
    const hljs = (window as any).hljs;
    if (hljs) {
      ref.current.querySelectorAll('pre code').forEach((el: Element) => {
        hljs.highlightElement(el);
      });
    }
  }, [text]);

  if (!text) return null;

  return (
    <Paper
      ref={ref}
      className={`hydro-markdown ${className || ''}`}
      p="md"
      withBorder
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}
