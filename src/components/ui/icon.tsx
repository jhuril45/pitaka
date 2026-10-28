import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

type SymbolName = Extract<SymbolViewProps['name'], { ios?: unknown }>;

/** Named app icons mapped to SF Symbols (iOS) and Material Symbols (Android/web). */
const ICONS = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  transactions: { ios: 'list.bullet.rectangle', android: 'receipt_long', web: 'receipt_long' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  plan: { ios: 'calendar', android: 'event_note', web: 'event_note' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  wallet: { ios: 'wallet.bifold', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  synced: { ios: 'checkmark.icloud', android: 'cloud_done', web: 'cloud_done' },
  offline: { ios: 'icloud.slash', android: 'cloud_off', web: 'cloud_off' },
  syncing: { ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' },
  error: { ios: 'exclamationmark.triangle', android: 'error', web: 'error' },
  back: { ios: 'chevron.left', android: 'arrow_back_ios_new', web: 'arrow_back_ios_new' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  eye: { ios: 'eye', android: 'visibility', web: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
} as const satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  color: ColorValue;
}

export function Icon({ name, size = 24, color }: IconProps) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}
