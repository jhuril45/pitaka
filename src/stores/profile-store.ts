import { create } from 'zustand';

interface ProfileState {
  /** The profile every screen shows; null until it has been loaded or created. */
  profileUuid: string | null;
  setProfileUuid: (profileUuid: string | null) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profileUuid: null,
  setProfileUuid: (profileUuid) => set({ profileUuid }),
}));

/** The current profile uuid; only call from screens that render after it is set. */
export function useCurrentProfileUuid(): string {
  const profileUuid = useProfileStore((s) => s.profileUuid);
  if (!profileUuid) throw new Error('No current profile');
  return profileUuid;
}
