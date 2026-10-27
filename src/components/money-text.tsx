import type { TextProps } from 'react-native';

import { formatMoney, type FormatOptions } from '@/lib/money';
import { usePrivacyStore } from '@/stores/privacy-store';

import { AppText } from './ui/text';

interface MoneyTextProps extends Omit<TextProps, 'children'> {
  amountMinor: number;
  currency?: string;
  variant?: Parameters<typeof AppText>[0]['variant'];
  /** Colour by sign/kind: income green, expense red. */
  tone?: 'default' | 'muted' | 'income' | 'expense';
  options?: FormatOptions;
  /** Respect the "hide amounts" toggle (default true). */
  maskable?: boolean;
}

/** A formatted amount with tabular digits; shows ₱••••• when amounts are hidden. */
export function MoneyText({ amountMinor, currency = 'PHP', variant = 'body', tone = 'default', options, maskable = true, ...rest }: MoneyTextProps) {
  const hidden = usePrivacyStore((s) => s.hideAmounts) && maskable;
  const text = hidden ? `${formatMoney(0, currency).replace(/[\d.,]+/, '•••••')}` : formatMoney(amountMinor, currency, options);
  return (
    <AppText variant={variant} tone={tone} numeric accessibilityLabel={hidden ? 'Amount hidden' : text} {...rest}>
      {text}
    </AppText>
  );
}
