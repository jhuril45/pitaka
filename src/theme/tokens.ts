import { Platform } from 'react-native';

/** Brand palette. Teal primary, warm accent; semantic colors for money states. */
const palette = {
  teal50: '#F0FDFA',
  teal100: '#CCFBF1',
  teal500: '#14B8A6',
  teal600: '#0D9488',
  teal700: '#0F766E',
  teal900: '#134E4A',
  amber500: '#F59E0B',
  red500: '#EF4444',
  red400: '#F87171',
  green600: '#16A34A',
  green400: '#4ADE80',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',
  slate950: '#020617',
  white: '#FFFFFF',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  primaryMuted: string;
  accent: string;
  income: string;
  expense: string;
  warning: string;
  danger: string;
  tabInactive: string;
}

export const colors: Record<'light' | 'dark', ThemeColors> = {
  light: {
    background: palette.slate50,
    surface: palette.white,
    surfaceMuted: palette.slate100,
    border: palette.slate200,
    text: palette.slate900,
    textMuted: palette.slate500,
    primary: palette.teal700,
    onPrimary: palette.white,
    primaryMuted: palette.teal100,
    accent: palette.amber500,
    income: palette.green600,
    expense: palette.red500,
    warning: palette.amber500,
    danger: palette.red500,
    tabInactive: palette.slate400,
  },
  dark: {
    background: palette.slate950,
    surface: palette.slate900,
    surfaceMuted: palette.slate800,
    border: palette.slate700,
    text: palette.slate50,
    textMuted: palette.slate400,
    primary: palette.teal500,
    onPrimary: palette.slate950,
    primaryMuted: palette.teal900,
    accent: palette.amber500,
    income: palette.green400,
    expense: palette.red400,
    warning: palette.amber500,
    danger: palette.red400,
    tabInactive: palette.slate500,
  },
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;

/** Tabular digits keep amounts aligned in lists. */
export const amountFont = {
  fontVariant: ['tabular-nums'] as const,
  ...Platform.select({ ios: { fontFamily: 'System' }, default: {} }),
};

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}
