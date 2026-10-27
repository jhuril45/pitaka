import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Logo } from '@/components/logo';
import { AppText } from '@/components/ui/text';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { initParse } from '@/parse/init';
// Defines the OS background-sync task; must load before the app registers it.
import '@/sync/background';
import { useTheme } from '@/theme';

// Parse setup is synchronous and offline-safe, so it runs before the first render.
let startupError: string | null = null;
try {
  initParse();
} catch (error) {
  startupError = error instanceof Error ? error.message : String(error);
}

export default function RootLayout() {
  const theme = useTheme();
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
    },
  };

  if (startupError) {
    return <StartupError message={startupError} />;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        {/* On a wide browser window, show the app as a phone-width column. */}
        <View style={[styles.page, { backgroundColor: theme.scheme === 'dark' ? '#000000' : theme.colors.surfaceMuted }]}>
          <View style={[styles.app, Platform.OS === 'web' && { borderColor: theme.colors.border }]}>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </View>
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const auth = useAuth();
  const { colors } = useTheme();
  if (auth.status === 'loading') return <LaunchScreen />;

  const signedIn = auth.status === 'account';

  // Signed-out users can only reach the landing and auth screens; signed-in users only the app.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      {/* Signed-out visitors asking for the app land on Welcome, not whichever auth screen sorts first. */}
      <Stack.Protected guard={signedIn} redirectTo="/welcome">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">

        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
    </Stack>
  );
}

/** Shown while the previous session is restored from the device. */
function LaunchScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <Logo size={72} />
    </View>
  );
}

function StartupError({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.error, { backgroundColor: colors.background }]}>
      <AppText variant="heading">Pitaka can’t start</AppText>
      <AppText tone="muted">{message}</AppText>
    </View>
  );
}

/** Widest the app column gets on web (like a large phone). */
const WEB_MAX_WIDTH = 480;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, ...(Platform.OS === 'web' ? { alignItems: 'center' } : null) },
  app: {
    flex: 1,
    width: '100%',
    ...(Platform.OS === 'web' ? { maxWidth: WEB_MAX_WIDTH, overflow: 'hidden', borderLeftWidth: 1, borderRightWidth: 1 } : null),
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { flex: 1, justifyContent: 'center', padding: 24, gap: 8 },
});
