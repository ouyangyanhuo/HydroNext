export const CODE_PASTE_LIMIT = 30;

export function getPasteCharacterCount(text: string) {
  return Array.from(text).length;
}

export function isCodePasteOverLimit(text: string) {
  return getPasteCharacterCount(text) > CODE_PASTE_LIMIT;
}
