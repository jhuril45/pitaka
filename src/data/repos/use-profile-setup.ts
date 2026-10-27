import { useEffect } from 'react';

import { useProfileStore } from '@/stores/profile-store';
import { syncNow } from '@/sync/engine';
import { currentUserId } from '@/sync/session';

import { ensureDefaultProfile, loadCurrentProfile, saveCurrentProfile } from './profiles';

/**
 * Pick the profile to show after sign-in: the one used last on this device,
 * otherwise whatever the first sync brings down, otherwise a new starter
 * profile. Returns the current profile uuid (null while setting up).
 */
export function useProfileSetup(): string | null {
  const profileUuid = useProfileStore((s) => s.profileUuid);
  const setProfileUuid = useProfileStore((s) => s.setProfileUuid);

  useEffect(() => {
    if (profileUuid) return;
    let active = true;
    void (async () => {
      const userId = await currentUserId();
      if (!userId) return;
      let current = await loadCurrentProfile(userId);
      if (!current) {
        // Fresh device: see what the server has first (offline just returns).
        await syncNow('setup');
        current = (await loadCurrentProfile(userId)) ?? (await ensureDefaultProfile(userId));
      }
      await saveCurrentProfile(userId, current);
      if (active) setProfileUuid(current);
    })();
    return () => {
      active = false;
    };
  }, [profileUuid, setProfileUuid]);

  return profileUuid;
}
