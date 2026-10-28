import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AppText } from '@/components/ui/text';
import { biometricsAvailable, clearLock, enableLock, isLockEnabled, LOCK_SUPPORTED, PIN_LENGTH, verifyPin } from '@/features/lock/lock-settings';
import { PinPad } from '@/features/lock/pin-pad';
import { useTheme } from '@/theme';

type Step = { kind: 'status' } | { kind: 'new' } | { kind: 'confirm'; first: string } | { kind: 'off' };

/** Turn the app lock on (choose a PIN) or off (enter the PIN). */
export default function AppLockScreen() {
  const { colors, spacing } = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [biometrics, setBiometrics] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'status' });
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void isLockEnabled().then(setEnabled);
    void biometricsAvailable().then(setBiometrics);
  }, []);

  if (!LOCK_SUPPORTED) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
        <AppText tone="muted">App lock is available in the Pitaka phone app.</AppText>
      </ScrollView>
    );
  }
  if (enabled === null) return null;

  async function onPin(next: string) {
    setPin(next);
    setMessage(null);
    if (step.kind === 'confirm' && next.length === step.first.length) {
      if (next !== step.first) {
        setMessage('Those PINs don’t match. Choose your PIN again.');
        setPin('');
        setStep({ kind: 'new' });
        return;
      }
      await enableLock(next);
      setEnabled(true);
      setPin('');
      setStep({ kind: 'status' });
      setMessage('App lock is on.');
    }
    if (step.kind === 'off' && next.length >= PIN_LENGTH.min && (await verifyPin(next))) {
      await clearLock();
      setEnabled(false);
      setPin('');
      setStep({ kind: 'status' });
      setMessage('App lock is off.');
    }
  }

  const prompt =
    step.kind === 'new'
      ? `Choose a ${PIN_LENGTH.min}–${PIN_LENGTH.max} digit PIN`
      : step.kind === 'confirm'
        ? 'Enter the same PIN again'
        : step.kind === 'off'
          ? 'Enter your PIN to turn the lock off'
          : null;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      {message ? <AppText style={{ color: colors.income }}>{message}</AppText> : null}
      {prompt ? (
        <Card style={{ alignItems: 'center', gap: spacing.md }}>
          <AppText variant="heading">{prompt}</AppText>
          <PinPad value={pin} onChange={(v) => void onPin(v)} length={step.kind === 'confirm' ? step.first.length : PIN_LENGTH.max} />
          {step.kind === 'new' ? (
            <Button
              title="Next"
              disabled={pin.length < PIN_LENGTH.min}
              onPress={() => {
                setStep({ kind: 'confirm', first: pin });
                setPin('');
              }}
            />
          ) : null}
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => {
              setStep({ kind: 'status' });
              setPin('');
            }}
          />
        </Card>
      ) : (
        <Card>
          <AppText variant="heading">{enabled ? 'App lock is on' : 'App lock is off'}</AppText>
          <AppText tone="muted">
            {enabled
              ? `Pitaka asks for your PIN${biometrics ? ' or fingerprint/face' : ''} when you open it, and after 30 seconds away.`
              : `Ask for a PIN${biometrics ? ' or your fingerprint/face' : ''} whenever Pitaka opens. The PIN stays on this phone.`}
          </AppText>
          <Button
            title={enabled ? 'Turn off' : 'Turn on'}
            variant={enabled ? 'outline' : 'primary'}
            onPress={() => {
              setMessage(null);
              setStep(enabled ? { kind: 'off' } : { kind: 'new' });
            }}
          />
        </Card>
      )}
    </ScrollView>
  );
}
