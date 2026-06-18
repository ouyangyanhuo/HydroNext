import { createTheme, type MantineColorsTuple } from '@mantine/core';

const hydroTeal: MantineColorsTuple = [
  '#e7f8f6',
  '#cdeeea',
  '#9adde2',
  '#65cbd8',
  '#39b8cd',
  '#22a9c4',
  '#14899f',
  '#0d6d7f',
  '#095465',
  '#063d4b',
];

const hydroCopper: MantineColorsTuple = [
  '#fff2e9',
  '#ffe0c9',
  '#ffc096',
  '#f99d60',
  '#eb7d38',
  '#d96c2f',
  '#ad5120',
  '#8d3f18',
  '#713314',
  '#5b2a12',
];

export const theme = createTheme({
  primaryColor: 'hydroTeal',
  colors: { hydroTeal, hydroCopper },
  fontFamily: 'var(--hydro-font-family)',
  headings: {
    fontFamily: 'var(--hydro-font-family)',
    fontWeight: '700',
  },
  radius: {
    xs: '3px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '8px',
  },
  defaultRadius: 'md',
  components: {
    Button: { defaultProps: { size: 'sm', radius: 'md' } },
    Card: { defaultProps: { radius: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Badge: { defaultProps: { radius: 'sm' } },
    TextInput: { defaultProps: { size: 'sm' } },
    Select: { defaultProps: { size: 'sm' } },
    Textarea: { defaultProps: { size: 'sm' } },
  },
});
