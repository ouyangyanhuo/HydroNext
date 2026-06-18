import { Paper } from '@mantine/core';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

interface MarkdownRendererProps {
  content: any;
  className?: string;
}

/**
 * Renders Markdown/HTML content from the backend.
 * Handles multilingual content objects like { "en": "...", "zh": "..." }.
 * The backend already renders Markdown to HTML, so we just inject it.
 * For safety, this should only be used with trusted server-rendered content.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const language = useSessionStore((s) => s.language);
  const text = extractLocalizedContent(content, language);

  if (!text) return null;

  return (
    <Paper
      className={`hydro-markdown ${className || ''}`}
      p="md"
      withBorder
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}
