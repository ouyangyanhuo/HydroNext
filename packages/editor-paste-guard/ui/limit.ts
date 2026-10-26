import { resolvePasteLimit } from '../config';

export { DEFAULT_PASTE_LIMIT as CODE_PASTE_LIMIT } from '../config';

export function getPasteCharacterCount(text: string) {
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.codePointAt(index)! > 0xFFFF) index++;
    count++;
  }
  return count;
}

export function isCodePasteOverLimit(text: string, limit?: number) {
  const maximum = resolvePasteLimit(limit);
  return maximum !== -1 && (maximum === 0 || getPasteCharacterCount(text) > maximum);
}
