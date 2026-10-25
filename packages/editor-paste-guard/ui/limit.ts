export const CODE_PASTE_LIMIT = 30;

export function getPasteCharacterCount(text: string) {
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.codePointAt(index)! > 0xFFFF) index++;
    count++;
  }
  return count;
}

export function isCodePasteOverLimit(text: string) {
  return getPasteCharacterCount(text) > CODE_PASTE_LIMIT;
}
