import type { CSSProperties } from 'react';

// Stagger delays use CSS sibling-index(); older browsers get the index as a custom property instead.
const supportsSiblingIndex = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
  && CSS.supports('animation-delay: calc(sibling-index() * 0.1s)');

/** Inline `--sibling-index` (1-based) for browsers without sibling-index(); undefined when not needed. */
export function siblingIndexStyle(index: number): CSSProperties | undefined {
  if (supportsSiblingIndex) return undefined;
  return { '--sibling-index': index + 1 } as CSSProperties;
}
