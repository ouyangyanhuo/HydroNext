/**
 * Simple Markdown to HTML converter
 * Handles basic Markdown syntax: headers, bold, italic, links, images, code blocks, lists
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function processInline(text: string): string {
  // Code inline
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Strikethrough
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Images
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');
  return text;
}

export function markdownToHtml(md: string): string {
  if (!md) return '';

  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];
  let inList = false;
  let listType = '';
  let inTable = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        result.push(`<pre><code class="language-${codeBlockLang}">${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = '';
      } else {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      if (inList) {
        inList = false;
        listType = '';
      }
      if (inTable) {
        result.push(`<table>${tableRows.join('')}</table>`);
        inTable = false;
        tableRows = [];
      }
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      result.push(`<h${level}>${processInline(headerMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      result.push('<hr>');
      continue;
    }

    // Table
    if (line.includes('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      const cells = line.split('|').filter(c => c.trim() !== '');
      if (cells.some(c => c.match(/^[-:]+$/))) {
        // Separator row, skip
        continue;
      }
      const isHeader = tableRows.length === 0;
      const tag = isHeader ? 'th' : 'td';
      const row = `<tr>${cells.map(c => `<${tag}>${processInline(c.trim())}</${tag}>`).join('')}</tr>`;
      tableRows.push(row);
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*+]\s+/)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      const content = line.replace(/^\s*[-*+]\s+/, '');
      result.push(`<li>${processInline(content)}</li>`);
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s+/)) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      const content = line.replace(/^\s*\d+\.\s+/, '');
      result.push(`<li>${processInline(content)}</li>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const content = line.replace(/^>\s*/, '');
      result.push(`<blockquote>${processInline(content)}</blockquote>`);
      continue;
    }

    // Regular paragraph
    result.push(`<p>${processInline(line)}</p>`);
  }

  // Close any open elements
  if (inList) {
    result.push(`</${listType}>`);
  }
  if (inTable) {
    result.push(`<table>${tableRows.join('')}</table>`);
  }
  if (inCodeBlock) {
    result.push(`<pre><code class="language-${codeBlockLang}">${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
  }

  return result.join('\n');
}
