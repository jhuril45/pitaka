import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import Storage from '@/lib/kv';
import { useTheme } from '@/theme';

import { promptInstall, useInstallMode } from './install-prompt';

const DISMISSED = 'pitaka.install.dismissed';

/**
 * Suggests adding the web app to the home screen (web only; hidden once
 * installed). `dismissible` banners stay closed after "Not now".
 */
export function InstallBanner({ dismissible = true }: { dismissible?: boolean }) {
  const mode = useInstallMode();
  const { colors, spacing } = useTheme();
  const [dismissed, setDismissed] = useState<boolean | null>(dismissible ? null : false);

  useEffect(() => {
    if (!dismissible) return;
    let active = true;
    void Storage.getItem(DISMISSED).then((v) => active && setDismissed(v === '1'));
    return () => {
      active = false;
    };
  }, [dismissible]);

  if (dismissed !== false || (mode !== 'prompt' && mode !== 'ios')) return null;

  const close = () => {
    setDismissed(true);
    void Storage.setItem(DISMISSED, '1');
  };

  return (
    <Card style={{ borderColor: colors.primary, borderWidth: 1 }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={styles.flex}>
          <AppText variant="heading">Install Pitaka</AppText>
          <AppText tone="muted">
            {mode === 'prompt'
              ? 'Add it to your home screen and open it like an app — no browser, works offline.'
              : 'Open it like an app, without the browser: tap the Share button, then “Add to Home Screen”.'}
          </AppText>
        </View>
        {dismissible ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={close}>
            <Icon name="close" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {mode === 'prompt' ? <Button title="Install app" onPress={() => void promptInstall()} style={{ marginTop: spacing.sm }} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
});
