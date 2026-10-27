import { create } from 'zustand';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  /** Rows waiting in the outbox. */
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
  set: (patch: Partial<Omit<SyncState, 'set'>>) => void;
}

/** UI-facing sync status (the indicator, More → Sync). Data itself comes from repositories. */
export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  pending: 0,
  lastSyncedAt: null,
  error: null,
  set: (patch) => set(patch),
}));
