/* eslint-disable react-refresh/only-export-components -- Mantine's polymorphic factory returns React components. */
import {
  ActionIcon as MantineActionIcon, type ActionIconProps, Button as MantineButton, type ButtonProps,
  createPolymorphicComponent, UnstyledButton as MantineUnstyledButton, type UnstyledButtonProps,
} from '@mantine/core';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

const classes = (kind: string, className?: string) => ['hydro-button-feedback', kind, className].filter(Boolean).join(' ');

/** Preserve Mantine sizing, variants, link polymorphism, refs, and loading behavior. */
export const Button = createPolymorphicComponent<'button', ButtonProps, {
  Group: typeof MantineButton.Group;
  GroupSection: typeof MantineButton.GroupSection;
}>(forwardRef<HTMLButtonElement, ButtonProps>(({ className, ...props }, ref) => (
  <MantineButton {...props} ref={ref} className={classes('hydro-button', className)} />
)));
Button.displayName = 'HydroButton';
Button.Group = MantineButton.Group;
Button.GroupSection = MantineButton.GroupSection;

export const ActionIcon = createPolymorphicComponent<'button', ActionIconProps>(
  forwardRef<HTMLButtonElement, ActionIconProps>(({ className, ...props }, ref) => (
    <MantineActionIcon {...props} ref={ref} className={classes('hydro-icon-button', className)} />
  )),
);
ActionIcon.displayName = 'HydroActionIcon';

/** Custom navigation/list controls retain their own geometry and selected states. */
export const UnstyledButton = createPolymorphicComponent<'button', UnstyledButtonProps>(
  forwardRef<HTMLButtonElement, UnstyledButtonProps>(({ className, ...props }, ref) => (
    <MantineUnstyledButton {...props} ref={ref} className={classes('hydro-button-base', className)} />
  )),
);
UnstyledButton.displayName = 'HydroUnstyledButton';

/** Native controls (tabs, remove tags) keep their original HTML semantics and dimensions. */
export const ButtonBase = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(({ className, ...props }, ref) => (
  <button {...props} ref={ref} className={classes('hydro-button-base', className)} />
));
ButtonBase.displayName = 'HydroButtonBase';

export type { ActionIconProps, ButtonProps, UnstyledButtonProps };
