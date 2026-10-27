import type { ConfirmOptions } from './confirm';

export type { ConfirmOptions };

/** Web: the browser's own confirm dialog (react-native-web's Alert.alert is a no-op). */
export function confirm({ title, message }: ConfirmOptions): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}
