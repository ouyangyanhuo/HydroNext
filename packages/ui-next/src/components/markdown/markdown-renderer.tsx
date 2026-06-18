import { Paper } from '@mantine/core';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

/**
 * Renders Markdown/HTML content from the backend.
 * The backend already renders Markdown to HTML, so we just inject it.
 * For safety, this should only be used with trusted server-rendered content.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
    if (!content) return null;

    return (
        <Paper
            className={`hydro-markdown ${className || ''}`}
            p="md"
            withBorder
            dangerouslySetInnerHTML={{ __html: content }}
        />
    );
}
