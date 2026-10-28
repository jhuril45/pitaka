import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

import { biometricsAvailable, getPinLength, isLockEnabled, unlockWithBiometrics, verifyPin } from './lock-settings';
import { PinPad } from './pin-pad';

/** Lock again after the app has been in the background this long. */
const RELOCK_AFTER_MS = 30_000;

/**
 * Covers the app with a PIN / fingerprint screen when the lock is on: at
 * start, and after 30 s in the background. Content stays mounted underneath,
 * so sync and reminders keep working.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void isLockEnabled().then((on) => active && setLocked(on));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away >= RELOCK_AFTER_MS) void isLockEnabled().then((on) => on && setLocked(true));
      }
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return (
    <View style={styles.flex}>
      {locked === null ? null : (
        // While locked, hide the app from screen readers too, not just from view.
        <View style={styles.flex} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={!!locked}>
          {children}
        </View>
      )}
      {locked ? <LockScreen onUnlock={() => setLocked(false)} /> : null}
    </View>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { colors, spacing } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometrics, setBiometrics] = useState(false);
  const [length, setLength] = useState<number | null>(null);

  const tryBiometrics = async () => {
    if (await unlockWithBiometrics()) onUnlock();
  };

  const unlocked = useEffectEvent(onUnlock);
  // Once per lock: offer fingerprint/face straight away when the phone has it.
  useEffect(() => {
    let active = true;
    void getPinLength().then((n) => active && setLength(n));
    void biometricsAvailable().then((ok) => {
      if (!active) return;
      setBiometrics(ok);
      if (ok) void unlockWithBiometrics().then((success) => success && unlocked());
    });
    return () => {
      active = false;
    };
  }, []);

  async function onChange(next: string) {
    if (!length || next.length > length) return;
    setPin(next);
    setError(null);
    if (next.length < length) return;
    if (await verifyPin(next)) return onUnlock();
    haptics.error();
    setError('Wrong PIN. Try again.');
    setPin('');
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background, gap: spacing.lg }]} accessibilityViewIsModal>
      <Logo size={56} />
      <AppText variant="heading">Enter your PIN</AppText>
      <AppText tone={error ? 'danger' : 'muted'} accessibilityLiveRegion="polite">
        {error ?? ' '}
      </AppText>
      <PinPad value={pin} onChange={(v) => void onChange(v)} length={length ?? undefined} />
      {biometrics ? <Button title="Use fingerprint or face" variant="ghost" onPress={() => void tryBiometrics()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 100 },
});
