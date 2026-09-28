/** Use the actual history entry so domain, filters, pagination and hash survive. */
export function goBackOrFallback(history: Pick<History, 'length' | 'back'>, fallback: () => void) {
  if (history.length > 1) history.back();
  else fallback();
}
