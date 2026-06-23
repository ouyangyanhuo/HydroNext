import { createTheme, type MantineColorsTuple } from '@mantine/core';
import { ACCENT_PRESETS, type AccentColorValue, generateMantineTuple, getAccentScheme } from './accent-colors';

const hydroCopper: MantineColorsTuple = [
  '#fef3e8',
  '#fce4c8',
  '#f7c691',
  '#f0a556',
  '#e88a2a',
  '#d4863a',
  '#b06a25',
  '#8f531c',
  '#744115',
  '#5e3611',
];

const BASE_THEME_CONFIG = {
  fontFamily: 'var(--hydro-font-family)',
  headings: {
    fontFamily: 'var(--hydro-font-family)',
    fontWeight: '700' as const,
  },
  radius: {
    xs: '3px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '8px',
  },
  defaultRadius: 'md' as const,
  components: {
    Button: { defaultProps: { size: 'sm', radius: 'md' } },
    Card: { defaultProps: { radius: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Badge: { defaultProps: { radius: 'sm' } },
    TextInput: { defaultProps: { size: 'sm' } },
    Select: { defaultProps: { size: 'sm' } },
    Textarea: { defaultProps: { size: 'sm' } },
  },
};

const TUPLE_CACHE = new Map<string, MantineColorsTuple>();

function getTuple(hex: string): MantineColorsTuple {
  const key = hex.toLowerCase();
  if (!TUPLE_CACHE.has(key)) TUPLE_CACHE.set(key, generateMantineTuple(hex));
  return TUPLE_CACHE.get(key)!;
}

export function makeCssResolver(primary: MantineColorsTuple) {
  return () => ({
    variables: {} as Record<string, string>,
    light: {
      '--mantine-primary-color-filled': primary[6],
      '--mantine-primary-color-filled-hover': primary[7],
      '--mantine-primary-color-light': primary[0],
      '--mantine-primary-color-light-hover': primary[1],
      '--mantine-primary-color-light-color': primary[6],
    },
    dark: {
      '--mantine-primary-color-filled': primary[4],
      '--mantine-primary-color-filled-hover': primary[3],
      '--mantine-primary-color-light': primary[8],
      '--mantine-primary-color-light-hover': primary[7],
      '--mantine-primary-color-light-color': primary[4],
    },
  });
}

export function createDynamicTheme(accentColor: AccentColorValue) {
  const isPreset = accentColor in ACCENT_PRESETS;
  const primaryHex = isPreset
    ? getAccentScheme(accentColor).light.primary
    : accentColor;
  const primaryTuple = getTuple(primaryHex);

  return {
    theme: createTheme({
      ...BASE_THEME_CONFIG,
      primaryColor: 'hydroTeal',
      colors: {
        hydroTeal: primaryTuple,
        hydroCopper,
      },
    }),
    cssResolver: makeCssResolver(primaryTuple),
  };
}

export const theme = createTheme({
  ...BASE_THEME_CONFIG,
  primaryColor: 'hydroTeal',
  colors: {
    hydroTeal: getTuple('#3f879c'),
    hydroCopper,
  },
});
