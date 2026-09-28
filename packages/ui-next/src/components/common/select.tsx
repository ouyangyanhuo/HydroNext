import { MultiSelect, type MultiSelectProps, Select, type SelectProps } from '@mantine/core';
import { forwardRef } from 'react';
import { mergeSelectClasses, SELECT_CLASS_NAMES, shortSelectDimension } from './select-styles';

export interface ShortSelectProps extends Omit<SelectProps, 'width' | 'height'> {
  /** Control width in pixels, clamped to 72–320. Existing Mantine w also works. */
  width?: number;
  /** Input height (excluding label/description) in pixels, clamped to 24–48. */
  height?: number;
}
export type LongSelectProps = SelectProps;
export type TagMultiSelectProps = MultiSelectProps;

/** Compact toolbar control; searchable remains independently configurable. */
export const ShortSelect = forwardRef<HTMLInputElement, ShortSelectProps>(({
  className, classNames, comboboxProps, width, height, style, ...props
}, ref) => (
  <Select
    size="xs"
    radius="md"
    searchable={false}
    checkIconPosition="right"
    {...props}
    ref={ref}
    w={shortSelectDimension(width, 'width') ?? props.w}
    style={[
      { '--hydro-short-height': shortSelectDimension(height, 'height') === undefined ? undefined : `${shortSelectDimension(height, 'height')}px` },
      ...(Array.isArray(style) ? style : [style]),
    ]}
    className={['hydro-select', 'hydro-select--short', className].filter(Boolean).join(' ')}
    classNames={(theme, resolvedProps, ctx) => mergeSelectClasses(SELECT_CLASS_NAMES,
      typeof classNames === 'function' ? classNames(theme, resolvedProps, ctx) : classNames)}
    comboboxProps={{ withinPortal: true, shadow: 'md', offset: 6, ...comboboxProps }}
  />
));
ShortSelect.displayName = 'ShortSelect';

/** Full-width form control; use searchable={false} for small fixed enumerations. */
export const LongSelect = forwardRef<HTMLInputElement, LongSelectProps>(({
  className, classNames, comboboxProps, ...props
}, ref) => (
  <Select
    size="sm"
    radius="md"
    searchable
    checkIconPosition="right"
    {...props}
    ref={ref}
    className={['hydro-select', 'hydro-select--long', className].filter(Boolean).join(' ')}
    classNames={(theme, resolvedProps, ctx) => mergeSelectClasses(SELECT_CLASS_NAMES,
      typeof classNames === 'function' ? classNames(theme, resolvedProps, ctx) : classNames)}
    comboboxProps={{ withinPortal: true, shadow: 'md', offset: 6, ...comboboxProps }}
  />
));
LongSelect.displayName = 'LongSelect';

/** Searchable multi-value form control with Mantine's keyboard-accessible pills. */
export const TagMultiSelect = forwardRef<HTMLInputElement, TagMultiSelectProps>(({
  className, classNames, comboboxProps, ...props
}, ref) => (
  <MultiSelect
    size="sm"
    radius="md"
    searchable
    checkIconPosition="right"
    {...props}
    ref={ref}
    className={['hydro-select', 'hydro-select--multi', className].filter(Boolean).join(' ')}
    classNames={(theme, resolvedProps, ctx) => mergeSelectClasses(SELECT_CLASS_NAMES,
      typeof classNames === 'function' ? classNames(theme, resolvedProps, ctx) : classNames)}
    comboboxProps={{ withinPortal: true, shadow: 'md', offset: 6, ...comboboxProps }}
  />
));
TagMultiSelect.displayName = 'TagMultiSelect';
