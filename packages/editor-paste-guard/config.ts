export const DEFAULT_PASTE_LIMIT = 30;
export const PASTE_LIMIT_KEY = 'editor-paste-guard.maxLength';

export function parsePasteLimit(value: unknown): number | undefined {
    if (typeof value === 'string') {
        if (!/^-?\d+$/.test(value.trim())) return undefined;
        value = Number(value);
    }
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= -1 ? value : undefined;
}

export function resolvePasteLimit(value: unknown) {
    return parsePasteLimit(value) ?? DEFAULT_PASTE_LIMIT;
}
