/**
 * Extract the correct language version from a multilingual content object.
 *
 * Backend stores some content as { "en": "...", "zh": "..." } JSON objects
 * or as JSON strings. This utility extracts the correct version based on
 * the current language, with fallback to English, then the first available value.
 */

export function extractLocalizedContent(
  content: any,
  language: string,
): string {
  if (!content) return '';

  // If it's a string, try to parse as JSON first (backend may serialize multilingual objects)
  if (typeof content === 'string') {
    // Only try to parse if it looks like a JSON object
    if (content.startsWith('{') && content.endsWith('}')) {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === 'object' && parsed !== null) {
          return extractFromObject(parsed, language);
        }
      } catch {
        // Not valid JSON, return as-is
      }
    }
    return content;
  }

  // If it's a multilingual object like { "en": "...", "zh": "..." }
  if (typeof content === 'object') {
    return extractFromObject(content, language);
  }

  return String(content);
}

function extractFromObject(obj: Record<string, any>, language: string): string {
  // Try exact match (e.g., "zh")
  if (obj[language]) return String(obj[language]);

  // Try base language (e.g., "zh" from "zh_TW")
  const baseLang = language.split('_')[0];
  if (baseLang !== language && obj[baseLang]) return String(obj[baseLang]);

  // Fallback to English
  if (obj.en) return String(obj.en);

  // Fallback to first available value
  const values = Object.values(obj);
  if (values.length > 0) return String(values[0]);

  return '';
}
