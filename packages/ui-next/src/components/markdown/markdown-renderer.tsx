import { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mantine/core';
import MarkdownIt from 'markdown-it';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

// Create markdown-it instance with same config as ui-default
const md = new MarkdownIt({
  linkify: true,
  html: true,
});

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
  const rawText = extractLocalizedContent(content, language);

  // Convert Markdown to HTML
  const html = useMemo(() => {
    if (!rawText) return '';
    // If already HTML (starts with <), return as-is
    if (rawText.trim().startsWith('<')) return rawText;
    // Otherwise convert Markdown to HTML
    return md.render(rawText);
  }, [rawText]);

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
  }, [html]);

  if (!html) return null;

  return (
    <Box
      ref={ref}
      className={`hydro-markdown ${className || ''}`}
      p={0}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
