import { useEffect } from 'react';
import { AppState } from 'react-native';

import { postDueItems } from '@/data/repos/obligations';
import { useProfileStore } from '@/stores/profile-store';
import { registerBeforePush } from '@/sync/engine';

import { registerPushToken, scheduleReminders } from './reminders';

/** Post due recurring/installment items for the current profile (also runs before each sync push). */
async function postForCurrentProfile(): Promise<void> {
  const profileUuid = useProfileStore.getState().profileUuid;
  if (profileUuid) await postDueItems(profileUuid);
}
registerBeforePush(postForCurrentProfile);

/**
 * Daily housekeeping while signed in: on start and whenever the app returns
 * to the foreground, post due recurring/installment items (works offline) and
 * refresh reminders; try push registration once.
 */
export function useChores(profileUuid: string): void {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await postDueItems(profileUuid);
        if (!cancelled) await scheduleReminders(profileUuid);
      } catch {
        // Chores are best-effort; the next foreground tries again.
      }
    };
    void run();
    void registerPushToken();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [profileUuid]);
}
