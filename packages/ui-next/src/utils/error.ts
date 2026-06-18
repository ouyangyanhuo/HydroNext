/**
 * Format error message by substituting {0}, {1}, etc. with params
 */
export function formatErrorMessage(error: { message?: string, params?: any[] } | undefined, fallback: string): string {
  if (!error?.message) return fallback;
  let msg = error.message;
  if (error.params) {
    error.params.forEach((p: any, i: number) => {
      msg = msg.replace(`{${i}}`, String(p));
    });
  }
  return msg;
}
