/**
 * Translate the original error template before interpolating dynamic values.
 * Callers without a translator retain the existing formatting behavior.
 */
export function formatErrorMessage(
  error: { message?: string, params?: unknown[] } | null | undefined,
  fallback: string,
  translate?: (key: string) => string,
): string {
  if (
    error?.message === 'Field password validation failed.'
    || ((error?.message === 'Field {0} validation failed.' || error?.message === 'Field {0} or {1} validation failed.')
      && (error?.params?.[0] === 'password' || error?.params?.[0] === 'Password'))
  ) {
    return translate ? translate('Incorrect password') : 'Incorrect password';
  }
  const template = typeof error?.message === 'string' && error.message ? error.message : fallback;
  const message = translate ? translate(template) : template;
  if (!Array.isArray(error?.params)) return message;
  const params = error.params;
  // Replace in one pass so usernames containing placeholders or "$&" stay literal.
  return message.replace(/\{(\d+)\}/g, (placeholder, index: string) => (
    Number(index) < params.length ? String(params[Number(index)]) : placeholder
  ));
}
