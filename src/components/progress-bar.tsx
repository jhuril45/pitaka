import { View } from 'react-native';

import { useTheme } from '@/theme';

/** Horizontal bar; `bps` is 0–10000 (values above are drawn full). Optional pace marker. */
export function ProgressBar({ bps, color, markerBps }: { bps: number; color: string; markerBps?: number }) {
  const { colors, radius } = useTheme();
  const width = `${Math.min(100, Math.max(0, bps / 100))}%` as const;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(10000, bps) / 100) }}
      style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
      <View style={{ width, height: '100%', backgroundColor: color, borderRadius: radius.pill }} />
      {markerBps !== undefined ? (
        <View style={{ position: 'absolute', left: `${Math.min(100, markerBps / 100)}%`, top: 0, bottom: 0, width: 2, backgroundColor: colors.text, opacity: 0.35 }} />
      ) : null}
    </View>
  );
}
