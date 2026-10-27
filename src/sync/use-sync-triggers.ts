import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { registerBackgroundSync } from './background';
import { stopSync, syncNow } from './engine';

/**
 * Sync when the signed-in app starts, returns to the foreground, or regains a
 * connection; writes schedule their own debounced sync (repo.saveRecord) and
 * the OS runs the background task. Mount once, inside the signed-in app.
 */
export function useSyncTriggers(): void {
  useEffect(() => {
    void syncNow('start');
    void registerBackgroundSync().catch(() => undefined);

    let wasOnline = true;
    const network = Network.addNetworkStateListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      if (online && !wasOnline) void syncNow('reconnect');
      wasOnline = online;
    });

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow('foreground');
    });

    return () => {
      network.remove();
      appState.remove();
      stopSync();
    };
  }, []);
}
