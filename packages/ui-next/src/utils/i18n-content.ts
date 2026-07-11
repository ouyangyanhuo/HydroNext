/**
 * Extract the correct language version from a multilingual content object.
 *
 * Backend stores some content as { "en": "...", "zh": "..." } JSON objects
 * or as JSON strings. This utility extracts the correct version based on
 * the current language, with fallback to English, then the first available value.
 */

function extractFromObject(obj: Record<string, any>, language: string): string {
  const normalized = (language || 'en').replace(/-/g, '_');
  const candidates = [language, normalized, normalized.toLowerCase()];
  for (const candidate of candidates) {
    if (candidate && obj[candidate] != null) return String(obj[candidate]);
  }

  const baseLang = normalized.split('_')[0];
  if (obj[baseLang] != null) return String(obj[baseLang]);

  // Fallback to English
  if (obj.en) return String(obj.en);

  // Fallback to first available value
  const values = Object.values(obj);
  if (values.length > 0) return String(values[0]);

  return '';
}

export function extractLocalizedContent(
  content: any,
  language: string,
): string {
  if (!content) return '';

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) return extractFromObject(parsed, language);
      } catch {
        // Keep non-JSON Markdown unchanged.
      }
    }
    return content;
  }

  if (typeof content === 'object') return extractFromObject(content, language);
  return String(content);
}
