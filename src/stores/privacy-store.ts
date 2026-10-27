import { create } from 'zustand';

import Storage from '@/lib/kv';

const KEY = 'pitaka.hide-amounts';

interface PrivacyState {
  /** Mask money on overview screens (Home's eye toggle). */
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  hideAmounts: false,
  toggleHideAmounts: () => {
    const next = !get().hideAmounts;
    set({ hideAmounts: next });
    void Storage.setItem(KEY, next ? '1' : '0');
  },
}));

// Restore the saved choice (the store is async on every platform; IndexedDB on web).
void Storage.getItem(KEY)
  .then((saved) => {
    if (saved === '1') usePrivacyStore.setState({ hideAmounts: true });
  })
  .catch(() => undefined);
