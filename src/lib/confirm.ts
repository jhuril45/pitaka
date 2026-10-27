import { Alert } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText: string;
  /** Show the confirm button as destructive (red on iOS). */
  destructive?: boolean;
}

/**
 * Ask the user to confirm an action. Resolves true when they confirm.
 * Native: an Alert with Cancel / confirm. Web: see confirm.web.ts
 * (react-native-web's Alert.alert does nothing).
 */
export function confirm({ title, message, confirmText, destructive }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
