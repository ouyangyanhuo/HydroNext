import type { ComboboxProps } from '@mantine/core';

/** Keep the popup opaque; only animate transform, never list height or scroll position. */
export const SELECT_DROPDOWN_TRANSITION: NonNullable<ComboboxProps['transitionProps']> = {
  duration: 240,
  exitDuration: 180,
  timingFunction: 'cubic-bezier(.22, .61, .36, 1)',
  transition: {
    in: { transform: 'translate(0, 0) scale(1)', pointerEvents: 'auto' },
    out: {
      transform: 'translate(var(--hydro-select-motion-x, 0px), var(--hydro-select-motion-y, -6px)) scale(.985)',
      pointerEvents: 'none',
    },
    transitionProperty: 'transform',
  },
};

export function selectComboboxProps(custom?: ComboboxProps): ComboboxProps {
  return {
    withinPortal: true,
    shadow: 'md',
    offset: 6,
    ...custom,
    transitionProps: {
      ...SELECT_DROPDOWN_TRANSITION,
      // A caller opting out with duration: 0 must also get an immediate exit.
      ...(custom?.transitionProps?.duration !== undefined ? { exitDuration: custom.transitionProps.duration } : {}),
      ...custom?.transitionProps,
    },
  };
}

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
