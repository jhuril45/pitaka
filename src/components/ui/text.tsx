import { Text, type TextProps } from 'react-native';

import { amountFont, useTheme, type typography } from '@/theme';

interface AppTextProps extends TextProps {
  variant?: keyof typeof typography;
  tone?: 'default' | 'muted' | 'primary' | 'income' | 'expense' | 'danger';
  /** Use tabular digits for money and numbers. */
  numeric?: boolean;
}

export function AppText({ variant = 'body', tone = 'default', numeric, style, ...rest }: AppTextProps) {
  const { colors, typography } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    income: colors.income,
    expense: colors.expense,
    danger: colors.danger,
  }[tone];
  return <Text style={[typography[variant], { color }, numeric && amountFont, style]} {...rest} />;
}
