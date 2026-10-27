import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { colors, radius, spacing, typography, type Theme } from './tokens';

export * from './tokens';

/** Current theme, following the system light/dark setting. */
export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(() => ({ scheme, colors: colors[scheme], spacing, radius, typography }), [scheme]);
}
