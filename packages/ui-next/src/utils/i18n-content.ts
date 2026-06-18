/**
 * Extract the correct language version from a multilingual content object.
 *
 * Backend stores some content as { "en": "...", "zh": "..." } JSON objects.
 * This utility extracts the correct version based on the current language,
 * with fallback to English, then the first available value.
 */

export function extractLocalizedContent(
  content: any,
  language: string,
): string {
  if (!content) return '';

  // If it's already a string, return as-is
  if (typeof content === 'string') return content;

  // If it's a multilingual object like { "en": "...", "zh": "..." }
  if (typeof content === 'object') {
    // Try exact match (e.g., "zh")
    if (content[language]) return content[language];

    // Try base language (e.g., "zh" from "zh_TW")
    const baseLang = language.split('_')[0];
    if (baseLang !== language && content[baseLang]) return content[baseLang];

    // Fallback to English
    if (content.en) return content.en;

    // Fallback to first available value
    const values = Object.values(content);
    if (values.length > 0) return String(values[0]);
  }

  return String(content);
}
