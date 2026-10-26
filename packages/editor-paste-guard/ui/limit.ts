export function getPasteCharacterCount(text: string) {
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.codePointAt(index)! > 0xFFFF) index++;
    count++;
  }
  return count;
}
