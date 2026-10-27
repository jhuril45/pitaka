import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme, type ThemeColors } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

function variantColors(colors: ThemeColors, variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return { background: colors.primary, text: colors.onPrimary };
    case 'secondary':
      return { background: colors.surfaceMuted, text: colors.text };
    case 'outline':
      return { background: colors.surface, text: colors.primary, border: colors.primary };
    case 'danger':
      return { background: colors.danger, text: colors.onPrimary };
    case 'ghost':
      return { background: 'transparent', text: colors.primary };
  }
}

export function Button({ title, variant = 'primary', loading = false, disabled, style, ...rest }: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const tint = variantColors(colors, variant);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tint.background, borderRadius: radius.md, paddingHorizontal: spacing.lg },
        'border' in tint && { borderWidth: 1.5, borderColor: tint.border },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={tint.text} />
      ) : (
        <Text style={[styles.text, { color: tint.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
