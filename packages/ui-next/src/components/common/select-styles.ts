/** Shared slots also style dropdowns rendered outside the page through a portal. */
export const SELECT_CLASS_NAMES = {
  input: 'hydro-select__input',
  dropdown: 'hydro-select__dropdown',
  option: 'hydro-select__option',
};

export const SHORT_SELECT_LIMITS = {
  minWidth: 72,
  maxWidth: 320,
  minHeight: 24,
  maxHeight: 48,
} as const;

export function shortSelectDimension(value: number | undefined, kind: 'width' | 'height') {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const [min, max] = kind === 'width'
    ? [SHORT_SELECT_LIMITS.minWidth, SHORT_SELECT_LIMITS.maxWidth]
    : [SHORT_SELECT_LIMITS.minHeight, SHORT_SELECT_LIMITS.maxHeight];
  return Math.max(min, Math.min(max, value));
}

export function mergeSelectClasses<T extends string>(base: Partial<Record<T, string>>, custom?: Partial<Record<T, string>>) {
  const result = { ...base, ...custom };
  for (const key of Object.keys(base) as T[]) {
    result[key] = [base[key], custom?.[key]].filter(Boolean).join(' ');
  }
  return result;
}
