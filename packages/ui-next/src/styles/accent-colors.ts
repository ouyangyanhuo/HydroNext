import type { MantineColorsTuple } from '@mantine/core';

export type AccentColorValue = string;

export interface AccentPalette {
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
}

export interface AccentScheme {
  name: string;
  light: AccentPalette;
  dark: AccentPalette;
}

export const ACCENT_PRESETS: Record<string, AccentScheme> = {
  default: {
    name: 'Teal',
    light: {
      primary: '#3f879c',
      primaryStrong: '#2d6a7e',
      primarySoft: '#e2f0f4',
      accent: '#d4863a',
      accentSoft: '#fef3e8',
    },
    dark: {
      primary: '#6bb3c7',
      primaryStrong: '#8dcad9',
      primarySoft: '#1a3038',
      accent: '#e8a75e',
      accentSoft: '#3a2d18',
    },
  },
  blue: {
    name: 'Blue',
    light: {
      primary: '#228be6',
      primaryStrong: '#1971c2',
      primarySoft: '#dbe9fd',
      accent: '#e8870c',
      accentSoft: '#fff4e6',
    },
    dark: {
      primary: '#74c0fc',
      primaryStrong: '#a5d8ff',
      primarySoft: '#1a3550',
      accent: '#ffa94d',
      accentSoft: '#3d2a12',
    },
  },
  violet: {
    name: 'Violet',
    light: {
      primary: '#7950f2',
      primaryStrong: '#6741d9',
      primarySoft: '#ede9fe',
      accent: '#e64980',
      accentSoft: '#fff0f6',
    },
    dark: {
      primary: '#b197fc',
      primaryStrong: '#d0bfff',
      primarySoft: '#2d1a4e',
      accent: '#f06595',
      accentSoft: '#3d1a28',
    },
  },
  rose: {
    name: 'Rose',
    light: {
      primary: '#e64980',
      primaryStrong: '#c2255c',
      primarySoft: '#fce4ee',
      accent: '#f59f00',
      accentSoft: '#fff9db',
    },
    dark: {
      primary: '#f06595',
      primaryStrong: '#faa2c1',
      primarySoft: '#3d1a28',
      accent: '#ffd43b',
      accentSoft: '#4a4010',
    },
  },
};

export const DEFAULT_ACCENT = 'default';
export const PRESET_KEYS = Object.keys(ACCENT_PRESETS);

export function getAccentScheme(key: string): AccentScheme {
  return ACCENT_PRESETS[key] || ACCENT_PRESETS[DEFAULT_ACCENT];
}

function hexToHsl(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rr = Math.round(hue2rgb(p, q, h / 360 + 1 / 3) * 255);
  const gg = Math.round(hue2rgb(p, q, h / 360) * 255);
  const bb = Math.round(hue2rgb(p, q, h / 360 - 1 / 3) * 255);
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

export function generateMantineTuple(hex: string): MantineColorsTuple {
  const [h, s] = hexToHsl(hex);
  const lightnessSteps = [0.97, 0.93, 0.85, 0.75, 0.65, 0.55, 0.47, 0.40, 0.33, 0.26];
  const shades = lightnessSteps.map((l) => hslToHex(h, s, l));
  return shades as unknown as MantineColorsTuple;
}

export function accentToCssVars(palette: AccentPalette): Record<string, string> {
  return {
    '--hydro-primary': palette.primary,
    '--hydro-primary-strong': palette.primaryStrong,
    '--hydro-primary-soft': palette.primarySoft,
    '--hydro-accent': palette.accent,
    '--hydro-accent-soft': palette.accentSoft,
  };
}
